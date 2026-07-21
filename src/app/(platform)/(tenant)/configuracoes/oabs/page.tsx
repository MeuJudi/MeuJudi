import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth/guards";
import { OabsForm } from "./oabs-form";
import { OabRow } from "./oab-row";
import { cn } from "@/lib/utils";

type OabRowData = {
  id: string;
  oab_number: string;
  oab_uf: string;
  is_primary: boolean;
  user_id: string | null;
  validado_em?: string | null;
  validado_nome?: string | null;
  validado_situacao?: string | null;
  validado_tipo?: string | null;
  validado_match?: boolean | null;
};

export default async function OabsPage() {
  let oabs: OabRowData[] = [];
  let tenantName = "";
  let usersById = new Map<string, { name: string; email: string }>();

  // Faz tudo em um try/catch para mostrar erro se algo falhar
  try {
    const { supabase, profile } = await requireAppUser();

    // Carrega OABs com cache de validação
    const { data: oabsData, error: oabsErr } = await supabase
      .from("escritorio_oabs")
      .select(
        "id, oab_number, oab_uf, is_primary, user_id, validado_em, validado_nome, validado_situacao, validado_tipo, validado_match"
      )
      .eq("tenant_id", profile.tenant_id)
      .order("is_primary", { ascending: false });

    if (oabsErr) {
      // Fallback sem colunas de validação
      if (
        /validado_/i.test(oabsErr.message) ||
        /column.*does not exist/i.test(oabsErr.message)
      ) {
        const { data: fallback } = await supabase
          .from("escritorio_oabs")
          .select("id, oab_number, oab_uf, is_primary, user_id")
          .eq("tenant_id", profile.tenant_id)
          .order("is_primary", { ascending: false });
        oabs = (fallback ?? []) as OabRowData[];
      } else {
        // erro real — mostra mensagem
        return (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
              OABs do escritório
            </h2>
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p className="font-semibold">Erro ao listar OABs</p>
              <p className="mt-1 font-mono text-xs">{oabsErr.message}</p>
            </div>
          </div>
        );
      }
    } else {
      oabs = (oabsData ?? []) as OabRowData[];
    }

    // Nome do escritório
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenantName = tenant?.name ?? "";

    // Nomes dos advogados
    const userIds = Array.from(
      new Set(oabs.map((o) => o.user_id).filter(Boolean) as string[])
    );
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", userIds);
      const map = new Map<string, { name: string; email: string }>();
      for (const u of users ?? []) {
        map.set(u.id, { name: u.name, email: u.email });
      }
      usersById = map;
    }

    // Valida role owner (lança se não for)
    if (profile.role !== "owner" && profile.role !== "super_admin") {
      return (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Apenas o owner pode gerenciar as OABs do escritório.
        </div>
      );
    }
  } catch (err) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
          OABs do escritório
        </h2>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-semibold">Erro inesperado</p>
          <p className="mt-1 font-mono text-xs">
            {err instanceof Error ? err.message : String(err)}
          </p>
        </div>
      </div>
    );
  }

  const migrationMissing =
    oabs.length > 0 && oabs[0].validado_em === undefined;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
          OABs do escritório
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Lista de inscrições (OAB) vinculadas a este escritório. Clique em{" "}
          <strong>Validar</strong> para consultar a base oficial da OAB e
          conferir a situação e o nome do advogado.
        </p>
      </div>

      {migrationMissing && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Migration pendente</p>
          <p className="mt-1 text-xs">
            Aplique no Supabase a migration{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
              20260721000002_oab_validation_columns.sql
            </code>{" "}
            para habilitar a validação contra a base oficial da OAB.
          </p>
        </div>
      )}

      {oabs.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          Nenhuma OAB vinculada ao escritório. Cadastre abaixo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-3">OAB</th>
                <th className="px-4 py-3">Vinculado a</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Validação OAB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tenant-line)]">
              {oabs.map((oab) => {
                const isPessoal = !!oab.user_id;
                const user = isPessoal
                  ? usersById.get(oab.user_id!)
                  : null;
                const vinculado = isPessoal
                  ? user?.name ?? `Usuário ${oab.user_id!.slice(0, 6)}`
                  : tenantName || "Escritório";

                return (
                  <tr
                    key={oab.id}
                    className="text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]/50"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--color-card-foreground)]">
                      {oab.oab_number}/{oab.oab_uf}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--color-card-foreground)]">
                        {vinculado}
                      </p>
                      {isPessoal && user?.email && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {user.email}
                        </p>
                      )}
                      {!isPessoal && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          CNPJ do escritório
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                          isPessoal
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {isPessoal ? "Pessoal" : "Institucional"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <OabRow
                        oabId={oab.id}
                        oabNumber={oab.oab_number}
                        oabUf={oab.oab_uf}
                        expectedName={vinculado}
                        initialStatus={oab.validado_situacao ?? null}
                        initialValidadoEm={oab.validado_em ?? null}
                        initialValidadoNome={oab.validado_nome ?? null}
                        initialValidadoMatch={oab.validado_match ?? null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <OabsForm />
    </div>
  );
}
