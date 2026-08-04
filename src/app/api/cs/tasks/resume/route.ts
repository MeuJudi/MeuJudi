import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

// Backoff em blocos de 2 tentativas (achado 31/07/2026: destravar tudo sem
// critério, toda vez que o Bearer revalida, deixava uma tarefa que insiste
// em pausar tentar de novo imediatamente, sem espera nenhuma — uma causa
// de pausa recorrente conseguia chegar na tentativa 139 seguida). Índice =
// bloco de 2 tentativas (attempt 1-2 → bloco 0, 3-4 → bloco 1, ...); valor
// = minutos de espera desde a última atividade antes de poder tentar de
// novo. Depois do bloco 4 (tentativas 9-10), `complete/route.ts` já
// converte a próxima pausa em falha definitiva (MAX_TENTATIVAS_ANTES_DE_FALHAR),
// então não existe bloco 5.
const ESPERA_MINUTOS_POR_BLOCO = [0, 5, 30, 120, 480];

function elegivelParaRetry(attempt: number, lastActivityAt: string): boolean {
  const bloco = Math.min(ESPERA_MINUTOS_POR_BLOCO.length - 1, Math.floor(Math.max(0, attempt - 1) / 2));
  const esperaMinutos = ESPERA_MINUTOS_POR_BLOCO[bloco];
  if (esperaMinutos === 0) return true;
  return Date.now() - new Date(lastActivityAt).getTime() >= esperaMinutos * 60_000;
}

/**
 * POST /api/cs/tasks/resume
 *
 * Destrava tarefas paradas em `paused_login_required` ou `paused_rate_limit`
 * do tenant do device, devolvendo pra `pending` — sem isso elas nunca
 * voltam a ser escolhidas pelo `claim` (que só considera `pending` ou lease
 * expirado, ver /api/cs/tasks/claim/route.ts), mesmo depois do login/API
 * ser revalidado com sucesso. `paused_rate_limit` entra aqui também porque,
 * na prática, boa parte dessas pausas eram na verdade sessão/rede — se a
 * API acabou de ser validada com sucesso, vale a pena tentar de novo.
 * Chamado pelo CS (`pdpj-auth.ts::doEnsureApiSession`) assim que o Bearer é
 * capturado de novo.
 *
 * Só destrava quem já esperou o suficiente pro bloco de tentativas em que
 * está (`ESPERA_MINUTOS_POR_BLOCO`) — sem isso, uma tarefa que continua
 * pausando é destravada e tenta de novo toda vez que QUALQUER revalidação
 * de Bearer acontece no tenant (podia ser a cada minuto), mesmo sem nada
 * ter mudado desde a última tentativa.
 */
const PAGE_SIZE = 1000;
// UPDATE ... WHERE id IN (muitos uuids) num lote só estoura o tamanho da
// requisição pro PostgREST — achado 04/08/2026: com a fila de pausadas
// acumulada (quase 1000 elegíveis de uma vez, todas na tentativa 1, sem
// espera nenhuma), a chamada única falhava com 500 a cada ciclo, e a
// destrava nunca completava (mesmo classe de bug do filtro gigante de
// poll-pdpj-detalhes, ver pdpj-tarefas-abertas.ts).
const LOTE_UPDATE = 200;

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const candidatas: { id: string; attempt: number; last_activity_at: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sync_tasks")
      .select("id, attempt, last_activity_at")
      .eq("tenant_id", device.tenantId)
      .in("status", ["paused_login_required", "paused_rate_limit"])
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[cs/tasks/resume] falha ao buscar tarefas pausadas:", error);
      return NextResponse.json({ error: "tarefas_nao_destravadas" }, { status: 500 });
    }
    candidatas.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const elegiveis = candidatas
    .filter((t) => elegivelParaRetry(t.attempt ?? 0, t.last_activity_at ?? new Date(0).toISOString()))
    .map((t) => t.id);

  if (elegiveis.length === 0) return NextResponse.json({ ok: true, resumed: 0 });

  let resumed = 0;
  for (let i = 0; i < elegiveis.length; i += LOTE_UPDATE) {
    const lote = elegiveis.slice(i, i + LOTE_UPDATE);
    const { data, error } = await supabase
      .from("sync_tasks")
      .update({ status: "pending", last_activity_at: new Date().toISOString() })
      .in("id", lote)
      .select("id");
    if (error) {
      console.error("[cs/tasks/resume] falha ao destravar lote de tarefas:", error);
      // Não aborta os lotes seguintes por um lote falho — melhor destravar
      // o máximo possível do que travar tudo por causa de um pedaço.
      continue;
    }
    resumed += data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, resumed });
}
