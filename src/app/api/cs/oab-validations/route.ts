// Fase 3 (módulo CS) da validação de OAB via ConfirmADV — ver
// docs/roadmap/validacao-oab-confirmadv-cs.md. Mesmo padrão de
// src/app/api/cs/mural-requests/route.ts.
//
// [corrigido] O claim é escopado só por tenant_id, não por (tenant_id,
// user_id) do device. A validação de OAB é pessoal no sentido de que só o
// dono da OAB resolve o reCAPTCHA/código (isso acontece na página oficial
// do ConfirmADV, fora do controle do CS) — mas o dispositivo que abre a
// janela pode ser qualquer um pareado ao escritório. Escopar por user_id
// do device quebrava o caso normal de um escritório com vários
// advogados: só quem gerou o código de pareamento do CS conseguia validar
// a própria OAB; qualquer outro advogado do mesmo tenant nunca via a
// própria solicitação pendente.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const ESTADOS_ATIVOS = ["pendente", "aguardando_cs", "recaptcha_em_andamento", "aguardando_codigo", "validando"];

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { data: validation, error } = await supabase
    .from("oab_validations")
    .select("id, oab_number, oab_uf, professional_email, requester_name, status")
    .eq("tenant_id", device.tenantId)
    .in("status", ESTADOS_ATIVOS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "solicitacao_nao_carregada" }, { status: 500 });
  if (!validation) return NextResponse.json({ validation: null });

  // Claim atômico só quando ainda está 'pendente' — se já estava num estado
  // intermediário (ex.: o CS reiniciou no meio do fluxo), não regride nada,
  // só devolve os dados pra reabrir a janela do zero.
  if (validation.status === "pendente") {
    await supabase
      .from("oab_validations")
      .update({ status: "aguardando_cs" })
      .eq("id", validation.id)
      .eq("status", "pendente");
  }

  return NextResponse.json({
    validation: {
      id: validation.id,
      oab_number: validation.oab_number,
      oab_uf: validation.oab_uf,
      professional_email: validation.professional_email,
      requester_name: validation.requester_name,
    },
  });
}
