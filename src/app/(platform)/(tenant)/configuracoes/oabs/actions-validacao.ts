"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth/guards";
import { assertTenantWritable } from "@/lib/auth/access";
import { stripMask } from "@/lib/masks";
import {
  consultarOab,
  registrarStatusOab,
  type OabAdvogado,
} from "@/lib/oab-service";

export async function validarOab(input: {
  oab_number: string;
  oab_uf: string;
}): Promise<OabAdvogado | null> {
  await assertTenantWritable();
  const { supabase, profile } = await requireAppUser();
  const numero = stripMask(input.oab_number);
  const uf = input.oab_uf.toUpperCase();

  if (!numero || !uf) {
    throw new Error("Informe número e UF da OAB.");
  }

  const dados = await consultarOab(numero, uf);

  // Persiste status pessoal (vinculado ao usuário autenticado)
  if (dados) {
    await registrarStatusOab(profile.id, numero, uf, dados);
  }

  revalidatePath("/configuracoes/oabs");
  revalidatePath("/configuracoes/escritorio");
  return dados;
}
