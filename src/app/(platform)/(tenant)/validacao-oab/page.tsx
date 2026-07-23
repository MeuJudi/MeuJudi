import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { requireAppUser } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ValidacaoForm } from "./validacao-form";
import { StatusCard } from "./status-card";

const ESTADOS_ATIVOS = ["pendente", "aguardando_cs", "recaptcha_em_andamento", "aguardando_codigo", "validando"];
const ESTADOS_TERMINAIS_NEGATIVOS = ["recusada", "expirada", "erro", "cancelada"];

function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ValidacaoOabPage() {
  const { supabase, profile } = await requireAppUser();

  if (profile.role === "super_admin" || !profile.tenant_id) {
    redirect("/monitoramento");
  }

  const [{ data: tenant }, { data: ultimaSolicitacao }, { count: dispositivosAtivos }] = await Promise.all([
    supabase.from("tenants").select("access_status").eq("id", profile.tenant_id).maybeSingle(),
    supabase
      .from("oab_validations")
      .select("id, status, last_error, verified_at, oab_number, oab_uf")
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

  // C3 — auditoria: status "validada" não estava em nenhuma lista e caía
  // no caso default, mostrando o formulário de novo. Agora tratamos
  // explicitamente: se há solicitação validada OU o tenant está liberado
  // (defesa contra C2, onde a RPC pode ter atualizado o user mas falhado
  // no tenant), mostramos o card de sucesso em vez do formulário.
  const ultimaValidada = ultimaSolicitacao?.status === "validada" ? ultimaSolicitacao : null;
  const validadoPorCaminhoNormal = ultimaValidada !== null;
  const validadoPorLiberacaoTenant = tenantStatus === "liberado";
  const jaValidado = validadoPorCaminhoNormal || validadoPorLiberacaoTenant;

  const solicitacaoAtiva = ultimaSolicitacao && ESTADOS_ATIVOS.includes(ultimaSolicitacao.status) ? ultimaSolicitacao : null;
  const ultimaNegativa = ultimaSolicitacao && ESTADOS_TERMINAIS_NEGATIVOS.includes(ultimaSolicitacao.status) ? ultimaSolicitacao : null;
  const semCsPareado = !dispositivosAtivos;

  if (jaValidado) {
    const verifiedAt = ultimaValidada?.verified_at ?? null;
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-xl font-semibold text-green-900">
                  Identidade profissional validada
                </h1>
                <p className="mt-0.5 text-sm text-green-800">
                  {verifiedAt
                    ? `Validação concluída em ${formatarDataHora(verifiedAt)}.`
                    : "Validação concluída. O acesso ao MeuJudi está liberado."}
                </p>
              </div>
            </div>

            {ultimaValidada ? (
              <p className="rounded-md border border-green-200 bg-white/60 px-3 py-2 text-xs text-green-800">
                OAB {ultimaValidada.oab_number}/{ultimaValidada.oab_uf} confirmada pelo ConfirmADV.
              </p>
            ) : null}

            {!validadoPorCaminhoNormal && validadoPorLiberacaoTenant ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esta tela é uma proteção. O escritório foi liberado, mas não localizamos a
                validação original. Se o problema persistir, abra um chamado.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/monitoramento">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Ir para o painel
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/configuracoes/escritorio">Voltar para configurações</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
