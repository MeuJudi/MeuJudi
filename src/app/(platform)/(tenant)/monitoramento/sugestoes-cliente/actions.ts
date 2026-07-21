"use server";

import { revalidatePath } from "next/cache";
import { requireWritableAppUser as requireAppUser } from "@/lib/auth/guards";
import { createClient as createCliente, linkProcesso } from "../../clientes/actions";
import type { PoloParte } from "@/lib/clientes/sugestao-vinculo";

interface SugestaoRow {
  id: string;
  tenant_id: string;
  processo_id: string;
  nome_detectado: string;
  polo: PoloParte;
  cliente_id_sugerido: string | null;
  tipo: "vincular_existente" | "criar_novo";
  status: string;
}

async function buscarSugestao(supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"], sugestaoId: string) {
  const { data } = await supabase.from("sugestoes_vinculo_cliente").select("*").eq("id", sugestaoId).single<SugestaoRow>();
  if (!data) throw new Error("Sugestão não encontrada.");
  if (data.status !== "pendente") throw new Error("Essa sugestão já foi decidida.");
  return data;
}

async function marcarDecidida(
  supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"],
  sugestaoId: string,
  status: "aceito" | "rejeitado",
  userId: string,
) {
  await supabase
    .from("sugestoes_vinculo_cliente")
    .update({ status, decidido_por: userId, decidido_em: new Date().toISOString() })
    .eq("id", sugestaoId);
}

export async function aceitarVinculoExistente(sugestaoId: string) {
  const { supabase, profile } = await requireAppUser();
  const sugestao = await buscarSugestao(supabase, sugestaoId);
  if (!sugestao.cliente_id_sugerido) throw new Error("Sugestão sem cliente associado.");

  await linkProcesso(sugestao.cliente_id_sugerido, sugestao.processo_id, sugestao.polo);
  await marcarDecidida(supabase, sugestaoId, "aceito", profile.id);

  revalidatePath("/monitoramento/sugestoes-cliente");
}

export async function aceitarCriarCliente(sugestaoId: string) {
  const { supabase, profile } = await requireAppUser();
  const sugestao = await buscarSugestao(supabase, sugestaoId);
  if (!profile.tenant_id) throw new Error("Sem escritório vinculado.");

  let { data: coluna } = await supabase
    .from("client_kanban_columns")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (!coluna) {
    const { data: primeira } = await supabase
      .from("client_kanban_columns")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .order("position")
      .limit(1)
      .maybeSingle();
    coluna = primeira;
  }

  if (!coluna) throw new Error("Nenhuma coluna de clientes configurada — abra a página de Clientes uma vez antes de aceitar sugestões.");

  const novoCliente = await createCliente(profile.tenant_id, coluna.id, sugestao.nome_detectado, "", "");
  await linkProcesso(novoCliente.id, sugestao.processo_id, sugestao.polo);
  await marcarDecidida(supabase, sugestaoId, "aceito", profile.id);

  revalidatePath("/monitoramento/sugestoes-cliente");
}

export async function rejeitarSugestao(sugestaoId: string) {
  const { supabase, profile } = await requireAppUser();
  await buscarSugestao(supabase, sugestaoId);
  await marcarDecidida(supabase, sugestaoId, "rejeitado", profile.id);

  revalidatePath("/monitoramento/sugestoes-cliente");
}
