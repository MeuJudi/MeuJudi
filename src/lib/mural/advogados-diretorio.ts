import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuralDestinatarioAdvogado } from "./client";

function normalizeOab(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeUf(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => normalizeName(value)).filter(Boolean))];
}

/**
 * Registra advogados do Mural sem atribuir validação oficial.
 * Erros são tratados pelo chamador como best-effort para não interromper o poller.
 */
export async function registrarAdvogadosDoMural(
  supabase: SupabaseClient,
  tenantId: string,
  comunicacaoId: number,
  tribunal: string | null | undefined,
  destinatarios: MuralDestinatarioAdvogado[] | null | undefined,
) {
  const agora = new Date().toISOString();
  const tribunalNormalizado = normalizeName(tribunal).toUpperCase();

  for (const item of destinatarios ?? []) {
    const nome = normalizeName(item.advogado?.nome);
    const oabNumber = normalizeOab(item.advogado?.numero_oab);
    const oabUf = normalizeUf(item.advogado?.uf_oab);
    if (!nome || !oabNumber || !oabUf) continue;

    const { data: existing } = await supabase
      .from("lawyers_directory")
      .select("id, canonical_name, name_variants, tribunals, source, first_seen_at, mural_appearances")
      .eq("oab_number_normalized", oabNumber)
      .eq("oab_uf", oabUf)
      .maybeSingle();

    const nameVariants = uniqueStrings([...(existing?.name_variants ?? []), nome]);
    const tribunals = uniqueStrings([...(existing?.tribunals ?? []), tribunalNormalizado]);
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers_directory")
      .upsert({
        ...(existing?.id ? { id: existing.id } : {}),
        oab_number_normalized: oabNumber,
        oab_uf: oabUf,
        canonical_name: existing?.canonical_name ?? nome,
        name_variants: nameVariants,
        tribunals,
        source: existing?.source ?? "mural",
        first_seen_at: existing?.first_seen_at ?? agora,
        last_seen_at: agora,
        mural_appearances: Number(existing?.mural_appearances ?? 0) + 1,
      }, { onConflict: "oab_number_normalized,oab_uf" })
      .select("id")
      .single();
    if (lawyerError || !lawyer) throw lawyerError ?? new Error("Advogado não foi registrado no diretório.");

    const { data: mention } = await supabase
      .from("lawyer_directory_mentions")
      .select("id, appearances")
      .eq("lawyer_id", lawyer.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    await supabase.from("lawyer_directory_mentions").upsert({
      ...(mention?.id ? { id: mention.id } : {}),
      lawyer_id: lawyer.id,
      tenant_id: tenantId,
      mural_id: comunicacaoId,
      first_seen_at: mention ? undefined : agora,
      last_seen_at: agora,
      appearances: Number(mention?.appearances ?? 0) + 1,
    }, { onConflict: "lawyer_id,tenant_id" });
  }
}
