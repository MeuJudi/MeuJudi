"use server";

import { revalidatePath } from "next/cache";
import { requireWritableAppUser as requireAppUser } from "@/lib/auth/guards";
import { invalidarCache } from "@/lib/regex/engine";
import { registrarValidacao } from "@/lib/regex/metricas";
import type { CampoExtraido } from "@/lib/ia/types";

interface ItemRevisao {
  id: string;
  tenant_id: string;
  regex_id: string | null;
  campo: CampoExtraido;
  tribunal_origem: string | null;
  texto_original: string;
  valor_sugerido: Record<string, unknown> | null;
}

export async function confirmarItemRevisao(itemId: string) {
  const { supabase } = await requireAppUser();

  const { data: item } = await supabase
    .from("itens_revisao")
    .select("*")
    .eq("id", itemId)
    .single<ItemRevisao>();
  if (!item) throw new Error("Item de revisão não encontrado");

  await supabase
    .from("itens_revisao")
    .update({ status: "confirmado", valor_final: item.valor_sugerido, revisado_em: new Date().toISOString() })
    .eq("id", itemId);

  await registrarCorrecaoComoAprendizado(supabase, item, item.valor_sugerido ?? {}, true);

  revalidatePath("/monitoramento/revisao");
}

export async function corrigirItemRevisao(itemId: string, valorCorrigido: Record<string, unknown>) {
  const { supabase } = await requireAppUser();

  const { data: item } = await supabase
    .from("itens_revisao")
    .select("*")
    .eq("id", itemId)
    .single<ItemRevisao>();
  if (!item) throw new Error("Item de revisão não encontrado");

  await supabase
    .from("itens_revisao")
    .update({ status: "corrigido", valor_final: valorCorrigido, revisado_em: new Date().toISOString() })
    .eq("id", itemId);

  // Invalida o cache global — sem isso, o erro que o advogado acabou de
  // corrigir continuaria sendo servido pra outros tenants com o mesmo texto.
  await invalidarCache(supabase, item.texto_original, item.campo);

  await registrarCorrecaoComoAprendizado(supabase, item, valorCorrigido, false);

  revalidatePath("/monitoramento/revisao");
}

async function registrarCorrecaoComoAprendizado(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- client vem já tipado do guard, any só pro parâmetro aqui
  supabase: any,
  item: ItemRevisao,
  valorFinal: Record<string, unknown>,
  foiConfirmacao: boolean,
) {
  // Camada 6: registra como validação de origem 'humano' — sinal de
  // aprendizado mais confiável que existe no sistema. Só se o item veio de
  // um regex específico (pode ter vindo direto da Camada 4, sem regex nenhum).
  if (item.regex_id) {
    await registrarValidacao(supabase, {
      regexId: item.regex_id,
      tenantId: item.tenant_id,
      tribunalOrigem: item.tribunal_origem ?? "desconhecido",
      texto: item.texto_original,
      matchRegex: JSON.stringify(item.valor_sugerido),
      matchCorrigido: JSON.stringify(valorFinal),
      correto: foiConfirmacao,
      origemValidacao: "humano",
      campo: item.campo,
    });
  }

  // Toda correção (ou confirmação) humana vira caso de teste no golden
  // dataset (Parte 6), com prioridade sobre exemplos gerados só por IA.
  await supabase.from("golden_dataset_casos").insert({
    campo: item.campo,
    tipo_caso: "correcao_humana",
    texto: item.texto_original,
    resultado_esperado: valorFinal,
    deveria_casar: true,
    origem: `correcao_humana:${item.id}`,
  });

  await supabase.from("motor_extracao_log").insert({
    tipo: "correcao_humana",
    tenant_id: item.tenant_id,
    tribunal_origem: item.tribunal_origem,
    regex_id: item.regex_id,
    detalhes: {
      item_revisao_id: item.id,
      campo: item.campo,
      valor_sugerido: item.valor_sugerido,
      valor_final: valorFinal,
      foi_confirmacao: foiConfirmacao,
    },
  });
}
