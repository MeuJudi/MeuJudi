"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth/guards";
import { assertTenantWritable } from "@/lib/auth/access";
import { consultarOab, type OabAdvogado } from "@/lib/oab-service";

/**
 * Valida uma OAB já cadastrada (escritorio_oabs.id).
 * Se a migration de cache (20260721000002) estiver aplicada, persiste
 * o resultado na própria linha. Caso contrário, apenas consulta e
 * devolve o resultado.
 */
export async function validarOabEscritorio(oabId: string): Promise<OabAdvogado | null> {
  await assertTenantWritable();
  const { supabase, profile } = await requireAppUser();

  const { data: oab, error: oabErr } = await supabase
    .from("escritorio_oabs")
    .select("id, oab_number, oab_uf, tenant_id")
    .eq("id", oabId)
    .single();

  if (oabErr || !oab) throw new Error("OAB não encontrada no escritório.");
  if (oab.tenant_id !== profile.tenant_id && profile.role !== "super_admin") {
    throw new Error("Sem acesso a esta OAB.");
  }

  const dados = await consultarOab(oab.oab_number, oab.oab_uf);

  // Tenta persistir o cache. Se as colunas não existirem (migration pendente),
  // ignora o erro e segue — o resultado ainda é devolvido.
  try {
    await supabase
      .from("escritorio_oabs")
      .update({
        validado_em: new Date().toISOString(),
        validado_nome: dados?.nome ?? null,
        validado_situacao: dados?.situacao ?? "NAO_ENCONTRADO",
        validado_tipo: dados?.tipo ?? null,
        validado_match: dados?.situacao
          ? /ATIV|REGULAR|REGULARMENTE|INSCRITO/i.test(dados.situacao)
          : false,
      })
      .eq("id", oabId);
  } catch {
    // colunas de cache ainda não existem; ignorar
  }

  revalidatePath("/configuracoes/oabs");
  revalidatePath("/configuracoes/escritorio");
  return dados;
}
