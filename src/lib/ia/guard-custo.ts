// Controle de custo: teto duplo (por tenant + sistema). Verificado ANTES de
// qualquer chamada de IA no pipeline — se bloqueado, cai pro modo "só regex"
// até o dia seguinte. Ver docs/roadmap/08-ia-regex.md seção 10.
//
// Adaptação em relação ao plano original: não existe tabela/UI de
// notificação (`notificacoes`, sino) neste projeto ainda — o evento de teto
// atingido é registrado em `motor_extracao_log` (já existe, já é a fonte do
// feed do Super Admin, Parte 10). O alerta por e-mail real fica pra Parte 10
// (este projeto não tem Resend configurado ainda).

import type { SupabaseClient } from "@supabase/supabase-js";

export type MotivoBloqueioCusto = "teto_tenant_atingido" | "teto_sistema_atingido";

export interface ResultadoGuardCusto {
  podeChamarIA: boolean;
  motivo?: MotivoBloqueioCusto;
}

function tetoSistemaUsd(): number {
  return parseFloat(process.env.TETO_CUSTO_IA_SISTEMA_USD ?? "10.00");
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Verifica os dois tetos (tenant + sistema) ANTES de qualquer chamada de IA.
 */
export async function verificarTetoCusto(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ResultadoGuardCusto> {
  const hoje = hojeISO();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("teto_custo_ia_diario_usd")
    .eq("id", tenantId)
    .maybeSingle();

  const { data: consumoTenant } = await supabase
    .from("consumo_ia_diario")
    .select("custo_usd_acumulado")
    .eq("tenant_id", tenantId)
    .eq("data", hoje)
    .maybeSingle();

  const custoTenantHoje = Number(consumoTenant?.custo_usd_acumulado ?? 0);
  if (tenant && custoTenantHoje >= Number(tenant.teto_custo_ia_diario_usd)) {
    return { podeChamarIA: false, motivo: "teto_tenant_atingido" };
  }

  const { data: consumoSistema } = await supabase
    .from("consumo_ia_diario")
    .select("custo_usd_acumulado")
    .eq("data", hoje);

  const custoSistemaHoje = (consumoSistema ?? []).reduce(
    (soma, r) => soma + Number(r.custo_usd_acumulado),
    0,
  );
  if (custoSistemaHoje >= tetoSistemaUsd()) {
    return { podeChamarIA: false, motivo: "teto_sistema_atingido" };
  }

  return { podeChamarIA: true };
}

/**
 * Registra o custo de uma chamada de IA já realizada no acumulado diário do
 * tenant. Chamar depois de toda camada que efetivamente gastou IA (Camada 3,
 * 4 ou 5), mesmo quando o resultado não resolveu nada — o custo já saiu.
 */
export async function registrarConsumoIA(
  supabase: SupabaseClient,
  tenantId: string,
  custoUsd: number,
): Promise<void> {
  if (custoUsd <= 0) return;

  const hoje = hojeISO();

  const { data: existente } = await supabase
    .from("consumo_ia_diario")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("data", hoje)
    .maybeSingle();

  const novoAcumulado = Number(existente?.custo_usd_acumulado ?? 0) + custoUsd;
  const novoTotalChamadas = Number(existente?.total_chamadas ?? 0) + 1;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("teto_custo_ia_diario_usd")
    .eq("id", tenantId)
    .maybeSingle();

  const atingiuTetoAgora = tenant ? novoAcumulado >= Number(tenant.teto_custo_ia_diario_usd) : false;
  const jaTinhaAtingido = existente?.teto_atingido ?? false;

  await supabase.from("consumo_ia_diario").upsert(
    {
      tenant_id: tenantId,
      data: hoje,
      custo_usd_acumulado: novoAcumulado,
      total_chamadas: novoTotalChamadas,
      teto_atingido: atingiuTetoAgora,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,data" },
  );

  // Loga só na transição (nunca atingido -> atingido), pra não gerar
  // 1 evento por chamada bloqueada depois — o feed do Motor de Extração
  // (Parte 10) fica poluído senão.
  if (atingiuTetoAgora && !jaTinhaAtingido) {
    await supabase.from("motor_extracao_log").insert({
      tipo: "teto_atingido",
      tenant_id: tenantId,
      detalhes: { escopo: "tenant", custo_acumulado_usd: novoAcumulado },
    });
  }
}
