// Engine de regex: Camadas -1 (cache global), 1 (regex múltiplos) e 2
// (validação de consistência). Ver docs/roadmap/08-ia-regex.md seções 4 e 5.
//
// Recebe o `SupabaseClient` por parâmetro (em vez de instanciar internamente)
// pra funcionar tanto dentro de um request do Next.js (client com sessão do
// usuário, respeitando RLS — `src/lib/supabase/server.ts`) quanto em scripts
// de background/teste (client de service role — `src/lib/supabase/service.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashTexto } from "./hash";
import { validarSegurancaRegex } from "./redos-guard";
import type { CampoExtraido, MatchResult, RegexMetadata } from "@/lib/ia/types";

function deveValidarComIA(regex: RegexMetadata): boolean {
  switch (regex.state) {
    case "novo":
      return true; // 100% validado
    case "quente":
      return Math.random() < 0.3; // 30% de amostragem
    case "confiavel":
      return Math.random() < 0.01; // 1%, só pra monitorar
    default:
      return true;
  }
}

/**
 * Ponto de entrada principal da extração via regex.
 * Ordem: Camada -1 (cache) -> Camada 1 (regex) -> Camada 2 (validação básica).
 *
 * Retorna `match: null` quando nada resolveu com confiança suficiente, ou
 * `confianca: "media"` quando um regex bateu mas precisa de validação por IA
 * (Camada 3 — Parte 5) antes de aceitar o resultado como definitivo.
 */
export async function executarRegex(
  supabase: SupabaseClient,
  tenantId: string,
  texto: string,
  campo: CampoExtraido,
): Promise<MatchResult> {
  const hash = hashTexto(texto);

  // CAMADA -1: cache global — antes de qualquer coisa
  const cacheHit = await buscarNoCache(supabase, hash, campo);
  if (cacheHit) return cacheHit;

  // CAMADA 1: regex ativas (tenant + globais) PRA ESSE CAMPO, ordenadas por
  // taxa de acerto. Filtrar por `campo` evita que uma regex de "valor"
  // seja testada contra um texto de "prazo" por engano (gap de schema
  // corrigido na Parte 6 — `campo` não existia antes).
  const { data: regexes, error } = await supabase
    .from("regex_metadata")
    .select("*")
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .eq("campo", campo)
    .in("state", ["novo", "quente", "confiavel"])
    .order("taxa_acerto", { ascending: false });

  if (error) {
    console.error("[engine] Erro ao buscar regex_metadata:", error);
    return { match: null, confianca: null, validadoIA: false };
  }

  if (!regexes || regexes.length === 0) {
    return { match: null, confianca: null, validadoIA: false };
  }

  for (const regex of regexes as RegexMetadata[]) {
    // Defesa em profundidade: revalida segurança mesmo de regex já aprovada
    // antes (barato o suficiente pra rodar sempre; protege contra o guard
    // ter sido atualizado com padrões de risco novos depois que essa regex
    // já estava em produção).
    const seguranca = await validarSegurancaRegex(regex.pattern, regex.flags || "i");
    if (!seguranca.seguro) {
      await desativarRegexInsegura(supabase, regex.id, seguranca.motivo ?? "desconhecido");
      continue;
    }

    let match: RegExpExecArray | null;
    try {
      const re = new RegExp(regex.pattern, regex.flags || "i");
      match = re.exec(texto);
    } catch (err) {
      console.error(`[engine] Erro ao executar regex ${regex.name}:`, err);
      continue;
    }
    if (!match) continue;

    // CAMADA 2: validação básica de consistência (antes de gastar IA)
    if (!passaValidacaoBasica(campo, match[0])) continue;

    if (deveValidarComIA(regex)) {
      // A validação por IA em si é a Parte 5 — quem chama `executarRegex` e
      // recebe `confianca: "media"` deve encaminhar pra Camada 3 antes de
      // aceitar o resultado como definitivo.
      return {
        match: match[0],
        confianca: "media",
        validadoIA: false,
        regexUsada: regex.pattern,
        regexId: regex.id,
      };
    }

    // Regex confiável, sem necessidade de validação nessa amostra: aceita direto
    const resultado: MatchResult = {
      match: match[0],
      confianca: "alta",
      validadoIA: false,
      regexUsada: regex.pattern,
      regexId: regex.id,
    };
    await salvarNoCache(supabase, hash, campo, resultado, regex.pattern);
    return resultado;
  }

  return { match: null, confianca: null, validadoIA: false };
}

/** Camada 2: validação de consistência básica — regras simples, sem custo. */
function passaValidacaoBasica(campo: CampoExtraido, valorBruto: string): boolean {
  switch (campo) {
    case "prazo": {
      const dias = parseInt(valorBruto.replace(/\D/g, ""), 10);
      return dias >= 1 && dias <= 90;
    }
    case "valor": {
      const valor = parseFloat(valorBruto.replace(/[^\d,.]/g, "").replace(",", "."));
      return valor > 0;
    }
    case "audiencia":
      // Validação de data futura fica a cargo de quem chama (precisa de
      // contexto de "data atual" e fuso, que a engine não deveria assumir sozinha).
      return valorBruto.length > 0;
    default:
      return true;
  }
}

async function buscarNoCache(
  supabase: SupabaseClient,
  hash: string,
  campo: CampoExtraido,
): Promise<MatchResult | null> {
  const { data } = await supabase
    .from("extracoes_cache")
    .select("*")
    .eq("hash_texto", hash)
    .eq("campo", campo)
    .maybeSingle();

  if (!data) return null;

  // Atualiza estatística de uso do cache. Precisa de `await`: em ambiente
  // serverless (Vercel) o processo pode encerrar assim que a resposta é
  // enviada, derrubando silenciosamente qualquer escrita "fire-and-forget"
  // que ainda estivesse em voo (achado testando de verdade — o contador
  // nunca incrementava num script curto).
  await supabase
    .from("extracoes_cache")
    .update({ total_hits: (data.total_hits ?? 0) + 1, ultimo_hit_em: new Date().toISOString() })
    .eq("id", data.id);

  return {
    match: (data.resultado as { match?: string })?.match ?? null,
    confianca: data.confianca,
    validadoIA: false,
    regexUsada: data.regex_ou_modelo_usado ?? undefined,
  };
}

async function salvarNoCache(
  supabase: SupabaseClient,
  hash: string,
  campo: CampoExtraido,
  resultado: MatchResult,
  regexOuModelo: string,
) {
  await supabase.from("extracoes_cache").upsert(
    {
      hash_texto: hash,
      campo,
      resultado: { match: resultado.match },
      confianca: resultado.confianca,
      regex_ou_modelo_usado: regexOuModelo,
    },
    { onConflict: "hash_texto,campo" },
  );
}

/**
 * Invalida (ou remove) uma entrada de cache — chamado pela Camada 6 (Central
 * de Revisão, Parte 7) quando um advogado corrige um resultado. Sem isso, o
 * erro antigo continuaria sendo servido pra outros tenants que batessem o
 * mesmo hash depois da correção.
 */
export async function invalidarCache(supabase: SupabaseClient, texto: string, campo: CampoExtraido) {
  const hash = hashTexto(texto);
  await supabase.from("extracoes_cache").delete().eq("hash_texto", hash).eq("campo", campo);
}

async function desativarRegexInsegura(supabase: SupabaseClient, regexId: string, motivo: string) {
  await supabase.from("regex_metadata").update({ state: "desativada" }).eq("id", regexId);
  await supabase.from("motor_extracao_log").insert({
    tipo: "erro",
    regex_id: regexId,
    detalhes: { motivo: `Regex desativada automaticamente por falha de segurança: ${motivo}` },
  });
}
