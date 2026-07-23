import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/guards";
import { ValidacaoForm } from "./validacao-form";
import { StatusCard } from "./status-card";

const ESTADOS_ATIVOS = ["pendente", "aguardando_cs", "recaptcha_em_andamento", "aguardando_codigo", "validando"];
const ESTADOS_TERMINAIS_NEGATIVOS = ["recusada", "expirada", "erro", "cancelada"];

export default async function ValidacaoOabPage() {
  const { supabase, profile } = await requireAppUser();

  if (profile.role === "super_admin" || !profile.tenant_id) {
    redirect("/monitoramento");
  }

  const [{ data: tenant }, { data: ultimaSolicitacao }, { count: dispositivosAtivos }] = await Promise.all([
    supabase.from("tenants").select("access_status").eq("id", profile.tenant_id).maybeSingle(),
    supabase
      .from("oab_validations")
      .select("id, status, last_error")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cs_devices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .is("revoked_at", null),
  ]);

  const tenantStatus = tenant?.access_status ?? "preparacao";

  // Se já foi liberado (ex.: liberação aconteceu entre o redirect e o
  // carregamento desta página), não deixa a pessoa presa aqui.
  if (tenantStatus === "liberado") {
    redirect("/monitoramento");
  }

  const solicitacaoAtiva = ultimaSolicitacao && ESTADOS_ATIVOS.includes(ultimaSolicitacao.status) ? ultimaSolicitacao : null;
  const ultimaNegativa = ultimaSolicitacao && ESTADOS_TERMINAIS_NEGATIVOS.includes(ultimaSolicitacao.status) ? ultimaSolicitacao : null;
  const semCsPareado = !dispositivosAtivos;

  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h1 className="font-display text-2xl font-semibold text-[var(--color-card-foreground)]">
        Valide sua identidade profissional
      </h1>
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Antes de sincronizar os dados do escritório, precisamos confirmar a OAB do responsável.
        Essa verificação protege o escritório e evita que dados sejam importados para a conta errada.
      </p>

      {semCsPareado ? (
        <div className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">
          Nenhum dispositivo MeuJudi CS pareado a este escritório ainda. A verificação pelo ConfirmADV
          acontece por lá — você pode parear agora ou depois de preencher os dados abaixo.{" "}
          <Link href="/configuracoes/meujudi-cs" className="font-medium text-[var(--tenant-brass)] underline">
            Configurar MeuJudi CS
          </Link>
        </div>
      ) : null}

      {solicitacaoAtiva ? (
        <StatusCard
          validationId={solicitacaoAtiva.id}
          initialStatus={solicitacaoAtiva.status}
          initialLastError={solicitacaoAtiva.last_error}
        />
      ) : (
        <>
          {ultimaNegativa ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {ultimaNegativa.last_error ?? "A última tentativa de validação não foi concluída. Preencha os dados novamente para tentar de novo."}
            </div>
          ) : null}
          <ValidacaoForm
            defaultOabNumber={profile.oab_number ?? ""}
            defaultOabUf={profile.oab_uf ?? ""}
            defaultRequesterName={profile.name}
          />
        </>
      )}
    </div>
  );
}
