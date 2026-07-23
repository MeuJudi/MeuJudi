// Gate de acesso a dados de tenant (Fase 1 da validação de OAB via
// ConfirmADV — docs/roadmap/validacao-oab-confirmadv-cs.md). Wrapper aditivo
// sobre requireAppUser/requireWritableAppUser — não mexe nelas diretamente
// pra não afetar as dezenas de call sites que devem continuar acessíveis
// mesmo sem validação (Configurações, onboarding, pareamento do CS, a
// própria tela de validação). Só quem chama estas funções novas fica sujeito
// ao bloqueio.

import { redirect } from "next/navigation";
import { requireAppUser } from "./guards";
import { isSupportMode } from "./access";

export async function requireTenantDataAccess() {
  const ctx = await requireAppUser();

  if (ctx.profile.role === "super_admin" || !ctx.profile.tenant_id) {
    return ctx;
  }

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("access_status")
    .eq("id", ctx.profile.tenant_id)
    .maybeSingle();

  if (tenant?.access_status !== "liberado") {
    redirect("/validacao-oab");
  }

  return ctx;
}

export async function requireWritableTenantDataAccess() {
  const ctx = await requireTenantDataAccess();
  if (await isSupportMode()) throw new Error("O Acesso de suporte é somente visualização.");
  return ctx;
}
