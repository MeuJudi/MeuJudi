/**
 * Validação e consulta de dados na OAB via Web Service oficial
 * Endpoint: https://www5.oab.org.br/cnaws/service.asmx
 *
 * Métodos SOAP/XML:
 * - ConsultaAdvogado(inscricao, uf, nome) — Retorna dados do advogado
 * - BuscaImagemAdvogado(numeroSeguranca) — Retorna foto
 *
 * Esse helper cacheia resultados por 7 dias no Supabase.
 */

import { createClient } from "@/lib/supabase/server";

export type OabAdvogado = {
  nome: string;
  inscricao: string;
  uf: string;
  situacao: string;
  tipo: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  numeroSeguranca?: number;
};

const OABS_WS_URL = "https://www5.oab.org.br/cnaws/service.asmx";
const OAB_API_KEY = process.env.OAB_API_KEY?.trim() ?? "";

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildSoapEnvelope(inscricao: string, uf: string, nome: string): string {
  const header = OAB_API_KEY
    ? `<soap:Header><Authentication xmlns="http://tempuri.org/"><Key>${xmlEscape(OAB_API_KEY)}</Key></Authentication></soap:Header>`
    : "<soap:Header />";
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${header}
  <soap:Body>
    <ConsultaAdvogado xmlns="http://tempuri.org/">
      <inscricao>${xmlEscape(inscricao)}</inscricao>
      <uf>${xmlEscape(uf)}</uf>
      <nome>${xmlEscape(nome)}</nome>
    </ConsultaAdvogado>
  </soap:Body>
</soap:Envelope>`;
}

function extractFromXml(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}[^>]*>([\\s\\S]*?)</(?:(?:[A-Za-z_][\\w.-]*):)?${tag}>`, "i"));
  if (!match) return null;
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function parseSoapResponse(xml: string): OabAdvogado | null {
  const result = extractFromXml(xml, "ConsultaAdvogadoResult");
  const payload = result && /<[^>]+>/.test(result) ? result : xml;
  const nome = extractFromXml(payload, "NOME");
  const inscricao = extractFromXml(payload, "INSCRICAO");
  const uf = extractFromXml(payload, "UF");
  const situacao = extractFromXml(payload, "SITUACAO");
  const tipo = extractFromXml(payload, "TIPO");
  const endereco = extractFromXml(payload, "ENDERECO");
  const cidade = extractFromXml(payload, "CIDADE");
  const estado = extractFromXml(payload, "ESTADO");
  const cep = extractFromXml(payload, "CEP");
  const telefone = extractFromXml(payload, "TELEFONE");
  const email = extractFromXml(payload, "EMAIL");
  const cpf = extractFromXml(payload, "CPF");
  const numeroSegurancaRaw = extractFromXml(payload, "NUMEROSEGURANCA") ?? extractFromXml(payload, "NUMERO_SEGURANCA");
  const numeroSeguranca = numeroSegurancaRaw && /^\d+$/.test(numeroSegurancaRaw) ? Number(numeroSegurancaRaw) : undefined;

  if (!nome && !inscricao) {
    return null;
  }

  return {
    nome: nome ?? "",
    inscricao: inscricao ?? "",
    uf: uf ?? "",
    situacao: situacao ?? "DESCONHECIDA",
    tipo: tipo ?? "",
    endereco: endereco ?? undefined,
    cidade: cidade ?? undefined,
    estado: estado ?? undefined,
    cep: cep ?? undefined,
    telefone: telefone ?? undefined,
    email: email ?? undefined,
    cpf: cpf ?? undefined,
    numeroSeguranca,
  };
}

export async function consultarOab(inscricao: string, uf: string): Promise<OabAdvogado | null> {
  const numero = inscricao.replace(/\D/g, "");
  const estado = uf.toUpperCase();

  if (!numero || !estado) {
    throw new Error("Número da OAB e UF são obrigatórios.");
  }
  if (!OAB_API_KEY) {
    throw new Error("OAB_API_KEY não configurada no ambiente do servidor.");
  }

  // Tenta cache primeiro (válido por 7 dias)
  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("oab_validations_cache")
    .select("*")
    .eq("oab_number", numero)
    .eq("oab_uf", estado)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return {
      nome: cached.nome ?? "",
      inscricao: cached.oab_number,
      uf: cached.oab_uf,
      situacao: cached.situacao ?? "DESCONHECIDA",
      tipo: cached.tipo_inscricao ?? "",
      endereco: cached.endereco ?? undefined,
      cidade: cached.cidade ?? undefined,
      estado: cached.estado ?? undefined,
      cep: cached.cep ?? undefined,
      telefone: cached.telefone ?? undefined,
      email: cached.email ?? undefined,
    };
  }

  // Consulta o Web Service oficial com retry (backoff exponencial)
  const envelope = buildSoapEnvelope(numero, estado, "");
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1500;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OABS_WS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "http://tempuri.org/ConsultaAdvogado",
        },
        body: envelope,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`OAB retornou status ${response.status}: ${body.replace(/\\s+/g, " ").slice(0, 240)}`);
      }

      const xml = await response.text();
      const parsed = parseSoapResponse(xml);

      // Salva no cache (inclusive quando não encontra)
      await supabase
        .from("oab_validations_cache")
        .upsert(
          {
            oab_number: numero,
            oab_uf: estado,
            nome: parsed?.nome ?? null,
            situacao: parsed?.situacao ?? "NAO_ENCONTRADO",
            tipo_inscricao: parsed?.tipo ?? null,
            endereco: parsed?.endereco ?? null,
            cidade: parsed?.cidade ?? null,
            estado: parsed?.estado ?? null,
            cep: parsed?.cep ?? null,
            telefone: parsed?.telefone ?? null,
            email: parsed?.email ?? null,
            fetched_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "oab_number,oab_uf" }
        );

      return parsed;
    } catch (err) {
      lastError = err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1); // 1.5s, 3s, 6s
      console.warn(
        `[OAB] Tentativa ${attempt}/${MAX_RETRIES} falhou. Retry em ${delay}ms...`,
        err instanceof Error ? err.message : err
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error("[OAB] Todas as tentativas falharam:", lastError);
  throw new Error(
    "Não foi possível validar a OAB agora. Tente novamente em alguns instantes."
  );
}

/**
 * Verifica se a API da OAB está respondendo.
 * Faz uma consulta leve (OAB 1/PR = teste genérico) e retorna status.
 */
export async function checkOabApiHealth(): Promise<{
  healthy: boolean;
  configured: boolean;
  latencyMs: number;
  checkedAt: string;
}> {
  const start = Date.now();
  if (!OAB_API_KEY) {
    return { healthy: false, configured: false, latencyMs: 0, checkedAt: new Date().toISOString() };
  }
  try {
    const response = await fetch(OABS_WS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/ConsultaAdvogado",
      },
      body: buildSoapEnvelope("1", "PR", ""),
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - start;
    return {
      healthy: response.ok,
      configured: true,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      healthy: false,
      configured: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function registrarStatusOab(
  userId: string,
  inscricao: string,
  uf: string,
  dados: OabAdvogado
) {
  const supabase = await createClient();
  const numero = inscricao.replace(/\D/g, "");
  const estado = uf.toUpperCase();

  const valido = dados.situacao
    ? /ATIV|REGULAR|REGULARMENTE|INSCRITO/i.test(dados.situacao)
    : false;

  await supabase.from("user_oab_status").upsert(
    {
      user_id: userId,
      oab_number: numero,
      oab_uf: estado,
      nome_oficial: dados.nome,
      situacao: dados.situacao,
      tipo_inscricao: dados.tipo,
      ultima_validacao: new Date().toISOString(),
      valido,
    },
    { onConflict: "user_id" }
  );
}
