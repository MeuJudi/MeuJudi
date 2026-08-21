import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { requireAppUser } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CsPairingGate } from "./cs-pairing-gate";
import { ValidacaoForm } from "./validacao-form";
import { StatusCard } from "./status-card";

const CS_ONLINE_JANELA_MS = 10 * 60 * 1000;

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

  const [{ data: tenant }, { data: ultimaSolicitacao }, { data: dispositivos }] = await Promise.all([
    supabase.from("tenants").select("name, access_status").eq("id", profile.tenant_id).maybeSingle(),
    supabase
      .from("oab_validations")
      .select("id, status, last_error, verified_at, oab_number, oab_uf")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cs_devices")
      .select("id, device_name, status, last_heartbeat")
      .eq("tenant_id", profile.tenant_id)
      .is("revoked_at", null),
  ]);

  const dispositivosAtivos = dispositivos?.length ?? 0;
  const agora = Date.now();
  const dispositivosOnline = (dispositivos ?? []).filter(
    (d) => d.status === "online" && d.last_heartbeat && agora - new Date(d.last_heartbeat).getTime() <= CS_ONLINE_JANELA_MS,
  ).length;

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

  // [corrigido] "jaValidado" sozinho travava a tela no card de sucesso pra
  // sempre, mesmo que o usuário tivesse acabado de abrir uma nova
  // solicitação (ex.: pelo link "validar formalmente" abaixo, pro caso de
  // tenant liberado por herança). Com `!solicitacaoAtiva`, assim que existe
  // uma tentativa em andamento o StatusCard assume — mesmo que o tenant já
  // esteja liberado.
  if (jaValidado && !solicitacaoAtiva) {
    const verifiedAt = ultimaValidada?.verified_at ?? null;

    // Puxa o estado real do escritório em vez de só mostrar uma mensagem
    // genérica — principalmente pro caso "liberado por herança" (tenant
    // já ativo antes do ConfirmADV existir, ver migration
    // 20260723000011_tenants_access_status.sql), onde não existe
    // `ultimaValidada` nenhuma pra mostrar.
    const [{ data: oabsData }, { data: validadasData }] = await Promise.all([
      supabase
        .from("escritorio_oabs")
        .select("id, oab_number, oab_uf, user_id, is_primary")
        .eq("tenant_id", profile.tenant_id)
        .order("is_primary", { ascending: false }),
      supabase
        .from("oab_validations")
        .select("oab_number, oab_uf")
        .eq("tenant_id", profile.tenant_id)
        .eq("status", "validada"),
    ]);
    const oabs = oabsData ?? [];
    const oabsConfirmadas = new Set((validadasData ?? []).map((v) => `${v.oab_number}/${v.oab_uf}`));

    const userIds = Array.from(new Set(oabs.map((o) => o.user_id).filter((id): id is string => !!id)));
    const usersById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name").in("id", userIds);
      for (const u of users ?? []) usersById.set(u.id, u.name);
    }

    return (
      <div className="mx-auto max-w-xl space-y-4 py-12">
        {/* W2 — auditoria: card com animação de entrada (scale-in + fade-in)
            e ícone com pulse sutil para reforçar visualmente o sucesso. */}
        <Card className="animate-scale-in border-green-200 bg-green-50">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-green-100 text-green-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-xl font-semibold text-green-900">
                  {tenant?.name ?? "Escritório"} está autenticado
                </h1>
                <p className="mt-0.5 text-sm text-green-800">
                  {verifiedAt
                    ? `Validação concluída em ${formatarDataHora(verifiedAt)}.`
                    : "O acesso ao MeuJudi está liberado."}
                </p>
              </div>
            </div>

            {ultimaValidada ? (
              <p className="rounded-md border border-green-200 bg-white/60 px-3 py-2 text-xs text-green-800">
                OAB {ultimaValidada.oab_number}/{ultimaValidada.oab_uf} confirmada pelo ConfirmADV.
              </p>
            ) : null}

            <div className="rounded-md border border-green-200 bg-white/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-900">
                OABs vinculadas ao escritório
              </p>
              {oabs.length === 0 ? (
                <p className="text-xs text-green-800">Nenhuma OAB cadastrada ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {oabs.map((oab) => {
                    const confirmada = oabsConfirmadas.has(`${oab.oab_number}/${oab.oab_uf}`);
                    return (
                      <li key={oab.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-green-900">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold">
                            {oab.oab_number}/{oab.oab_uf}
                          </span>
                          {oab.is_primary ? (
                            <span className="rounded-full border border-green-300 bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
                              Principal
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                              confirmada
                                ? "border-green-300 bg-green-100 text-green-800"
                                : "border-amber-200 bg-amber-50 text-amber-800",
                            )}
                          >
                            {confirmada ? "Confirmada via ConfirmADV" : "Sem validação individual"}
                          </span>
                        </span>
                        <span className="text-green-700">
                          {oab.user_id ? usersById.get(oab.user_id) ?? "Advogado do escritório" : "Institucional"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                href="/configuracoes/oabs"
                className="mt-2 inline-block text-xs font-semibold text-green-800 underline underline-offset-2"
              >
                Gerenciar OABs
              </Link>
            </div>

            <div className="rounded-md border border-green-200 bg-white/60 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-900">
                <MonitorSmartphone className="h-3.5 w-3.5" />
                MeuJudi Sync
              </p>
              <p className="text-xs text-green-800">
                {dispositivosAtivos === 0
                  ? "Nenhum dispositivo pareado. Instale o Sync para começar a sincronizar processos."
                  : `${dispositivosOnline} de ${dispositivosAtivos} dispositivo(s) pareado(s) online agora.`}
              </p>
              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                  dispositivosOnline > 0
                    ? "border-green-300 bg-green-100 text-green-800"
                    : "border-amber-200 bg-amber-50 text-amber-800",
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", dispositivosOnline > 0 ? "bg-green-600" : "bg-amber-500")}
                />
                {dispositivosOnline > 0 ? "Conectado" : "Desconectado"}
              </span>
            </div>

            {!validadoPorCaminhoNormal && validadoPorLiberacaoTenant ? (
              <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none font-semibold">
                  Este escritório foi liberado antes da validação automática por ConfirmADV existir.
                  Quero validar minha OAB formalmente agora →
                </summary>
                <p className="mb-3 mt-2 text-amber-800">
                  Isso cria uma solicitação normal de validação. Não é obrigatório — o acesso já
                  está liberado — mas deixa um registro de verdade da confirmação da sua OAB.
                </p>
                <ValidacaoForm
                  defaultOabNumber={profile.oab_number ?? ""}
                  defaultOabUf={profile.oab_uf ?? ""}
                  defaultRequesterName={profile.name}
                />
              </details>
            ) : null}

            <div className="flex animate-fade-in flex-wrap gap-2 [animation-delay:200ms]">
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

  // Se não há CS pareado e não há solicitação ativa, bloqueamos com o
  // CsPairingGate. Se há solicitação ativa, mostramos o StatusCard mesmo
  // sem CS — o usuário pode acompanhar/cancelar, e o CS pode reconectar.
  if (semCsPareado && !solicitacaoAtiva) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-card-foreground)]">
          Valide sua identidade profissional
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Antes de sincronizar os dados do escritório, precisamos confirmar a OAB do responsável.
          Essa verificação protege o escritório e evita que dados sejam importados para a conta errada.
        </p>
        <CsPairingGate tenantId={profile.tenant_id} />
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
