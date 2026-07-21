import { requireOwner } from "@/lib/auth/guards";
import { OabsForm } from "./oabs-form";
import { OabRow } from "./oab-row";

export default async function OabsPage() {
  const { supabase, profile } = await requireOwner();

  const { data: oabs } = await supabase
    .from("escritorio_oabs")
    .select(
      "id, oab_number, oab_uf, is_primary, user_id, validado_em, validado_nome, validado_situacao, validado_tipo, validado_match"
    )
    .eq("tenant_id", profile.tenant_id)
    .order("is_primary", { ascending: false });

  // Buscar nome do escritório e nome do dono da OAB pessoal
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const tenantName = tenant?.name ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
          OABs do escritório
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Cadastre a inscrição institucional do escritório e clique em
          <strong> Validar OAB </strong>
          para confirmar a situação na base oficial.
        </p>
      </div>

      <section className="space-y-3">
        {(oabs ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Nenhuma OAB vinculada ao escritório. Cadastre abaixo.
          </p>
        ) : (
          (oabs ?? []).map((oab) => (
            <div
              key={oab.id}
              className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-[var(--tenant-surface-foreground)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-base font-bold text-[var(--color-card-foreground)]">
                    OAB {oab.oab_number}/{oab.oab_uf}
                  </p>
                  {oab.user_id ? (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      OAB pessoal do membro
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      OAB institucional · {tenantName}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <OabRow
                  oabId={oab.id}
                  oabNumber={oab.oab_number}
                  oabUf={oab.oab_uf}
                  expectedName={oab.user_id ? null : tenantName}
                  initialStatus={oab.validado_situacao}
                  initialValidadoEm={oab.validado_em}
                  initialValidadoNome={oab.validado_nome}
                  initialValidadoMatch={oab.validado_match}
                />
              </div>
            </div>
          ))
        )}
      </section>

      <OabsForm />
    </div>
  );
}
