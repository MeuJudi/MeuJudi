import { createClient } from "@/lib/supabase/server";

/**
 * Debug temporário: mostra o estado real do banco para diagnóstico.
 * Acesse /configuracoes/oabs-debug para ver.
 */
export default async function OabsDebugPage() {
  const sb = await createClient();

  const checks: { name: string; result: string }[] = [];

  // 1. Tenta ler a tabela
  const { data, error } = await sb
    .from("escritorio_oabs")
    .select("id, oab_number, oab_uf, is_primary, user_id, validado_em, validado_nome, validado_situacao, validado_tipo, validado_match")
    .limit(1);

  checks.push({
    name: "SELECT escritorio_oabs (com validado_*)",
    result: error
      ? `ERRO: ${error.message} (code=${error.code}, hint=${error.hint ?? "n/a"})`
      : `OK (${data?.length ?? 0} rows)`,
  });

  // 2. Tenta ler sem validado_*
  const { data: data2, error: err2 } = await sb
    .from("escritorio_oabs")
    .select("id, oab_number, oab_uf, is_primary, user_id")
    .limit(1);
  checks.push({
    name: "SELECT escritorio_oabs (sem validado_*)",
    result: err2
      ? `ERRO: ${err2.message} (code=${err2.code})`
      : `OK (${data2?.length ?? 0} rows)`,
  });

  // 4. Tenta o cache OAB
  const { error: err4 } = await sb
    .from("oab_validations_cache")
    .select("oab_number")
    .limit(1);
  checks.push({
    name: "SELECT oab_validations_cache",
    result: err4
      ? `ERRO: ${err4.message} (code=${err4.code}, hint=${err4.hint ?? "n/a"})`
      : "OK",
  });

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Debug OAB</h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Diagnóstico das tabelas necessárias para /configuracoes/oabs
      </p>
      <div className="space-y-2">
        {checks.map((c) => (
          <div
            key={c.name}
            className={`rounded border p-3 text-sm font-mono ${
              c.result.startsWith("ERRO")
                ? "border-red-300 bg-red-50 text-red-800"
                : "border-green-300 bg-green-50 text-green-800"
            }`}
          >
            <p className="font-bold">{c.name}</p>
            <p className="mt-1 break-all">{c.result}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
