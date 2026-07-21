"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireWritableAppUser } from "@/lib/auth/guards";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export async function gerarCodigoPareamento() {
  const { supabase, profile } = await requireWritableAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem escritorio vinculado.");
  const { data, error } = await supabase.from("cs_pairing_codes").insert({
    tenant_id: profile.tenant_id, user_id: profile.id, codigo: generateCode(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("codigo, expires_at").single();
  if (error || !data) throw new Error(error?.message ?? "Nao foi possivel gerar o codigo.");
  revalidatePath("/configuracoes/meujudi-cs");
  return data;
}

export async function revogarDispositivo(deviceId: string) {
  const { supabase, profile } = await requireWritableAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem escritorio vinculado.");
  const { error } = await supabase.from("cs_devices").update({ revoked_at: new Date().toISOString() }).eq("id", deviceId).eq("tenant_id", profile.tenant_id).is("revoked_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes/meujudi-cs");
}
