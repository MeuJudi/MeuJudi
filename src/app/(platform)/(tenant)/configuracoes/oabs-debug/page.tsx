/**
 * Debug 2: tenta renderizar o oabs/page.tsx em server e captura
 * QUALQUER exception/erro de render. Mostra o stack real.
 */
import { requireAppUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function OabsDebug2Page() {
  // Etapa 1: tentar requireAppUser e ver o que ele retorna
  const stage1: { ok: boolean; data: unknown; error: string | null } = {
    ok: false,
    data: null,
    error: null,
  };
  try {
    const ctx = await requireAppUser();
    stage1.ok = true;
    stage1.data = {
      userId: ctx.authUser.id,
      email: ctx.authUser.email,
      role: ctx.profile.role,
      tenantId: ctx.profile.tenant_id,
      name: ctx.profile.name,
    };
  } catch (err) {
    stage1.error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  }

  // Etapa 2: tentar a query completa com colunas validado_*
  const stage2: { ok: boolean; data: unknown; error: string | null } = {
    ok: false,
    data: null,
    error: null,
  };
  if (stage1.ok) {
    try {
      const sb = await createClient();
      const ctx = await requireAppUser();
      const { data, error } = await sb
        .from("escritorio_oabs")
        .select(
          "id, oab_number, oab_uf, is_primary, user_id, validado_em, validado_nome, validado_situacao, validado_tipo, validado_match"
        )
        .eq("tenant_id", ctx.profile.tenant_id)
        .order("is_primary", { ascending: false });
      if (error) {
        stage2.error = `code=${error.code} msg=${error.message} hint=${error.hint ?? ""} details=${error.details ?? ""}`;
      } else {
        stage2.ok = true;
        stage2.data = { count: data?.length ?? 0, sample: data?.[0] ?? null };
      }
    } catch (err) {
      stage2.error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    }
  }

  // Etapa 3: apenas verificar se o módulo carrega (testa o import)
  const stage3: { ok: boolean; error: string | null } = {
    ok: true,
    error: null,
  };
  try {
    // Apenas import dinâmico para validar que os arquivos existem
    const path = await import("node:path");
    void path;
  } catch (err) {
    stage3.ok = false;
    stage3.error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  }

  function stageBlock(label: string, n: number, stage: { ok: boolean; data?: unknown; error: string | null }) {
    return (
      <div
        key={n}
        className={`rounded border p-3 text-sm ${
          stage.error
            ? "border-red-300 bg-red-50 text-red-800"
            : "border-green-300 bg-green-50 text-green-800"
        }`}
      >
        <p className="font-bold">
          {n}. {label} {stage.ok ? "✓" : "✗"}
        </p>
        {stage.error && (
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{stage.error}</pre>
        )}
        {stage.ok && stage.data !== undefined && stage.data !== null && (
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">
            {JSON.stringify(stage.data, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      <h1 className="text-2xl font-bold">Debug OAB 2 — staging</h1>
      <p className="text-sm">
        Cada bloco testa uma etapa do render. Se uma falhar, vai aparecer
        o erro real.
      </p>
      {stageBlock("requireAppUser", 1, stage1)}
      {stageBlock("query escritorio_oabs com validado_*", 2, stage2)}
      {stageBlock("imports (oab-row, oabs-form)", 3, stage3)}
    </div>
  );
}
