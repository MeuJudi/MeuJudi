/**
 * MeuJudi Sync — handlers PDPJ pro worker unificado (Fases 6 e 8).
 *
 * Transforma a extração por OAB/CNJ em tarefas persistentes na fila
 * (sync_tasks), substituindo o snapshot local antigo (pdpj-store.ts) —
 * ver o achado da Fase 0 em docs/roadmap/23a-fase0-inventario.md secao 1.3.
 *
 * pdpj_oab: pagina o portal por OAB+UF, e pra cada CNJ novo encontrado cria
 *   uma tarefa-filha pdpj_cnj (dedup automático via idempotency_key).
 * pdpj_cnj: busca o detalhe de um processo, garante que ele existe em
 *   `processos` e envia os links de documento encontrados pra
 *   `POST /api/cs/sync/pdpj`, que filtra e persiste com dedup
 *   (`processo_documentos`, Fase 8). Metadados de classe/órgão/partes
 *   continuam de fora — sem schema oficial confirmado do PDPJ (ver
 *   cs-pdpj-login-fix.md) — e não existe endpoint confirmado de texto de
 *   peça pra alimentar Regex/IA ainda; só o link oficial é entregue.
 */

import { MEUJUDI_WEB_URL } from '../shared/constants';
import { logger, recordDiagnosticEvent } from './logger';
import { PdpjApiClient, PdpjApiError, extractCnj } from './pdpj-api';
import { CookieStore } from './cookie-store';
import type { Pairing } from './pairing';
import type { PdpjAuth } from './pdpj-auth';
import type { TaskHandler, TaskHandlerResult } from './sync-worker';
import type { SyncTask } from '../shared/types';

interface OabTaskState {
  oabNumber: string;
  oabUf: string;
  searchAfter?: string[] | null;
  pageCount?: number;
}

/** Acha links de documentos/oficiais dentro da resposta bruta do PDPJ — mesma lógica usada no painel de teste manual (sources/pdpj.tsx). */
function findDocumentLinks(value: unknown, urls: string[] = [], depth = 0, path = ''): string[] {
  if (depth > 6 || urls.length >= 50) return urls;
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    if (!urls.includes(value)) urls.push(value);
  } else if (typeof value === 'string' && /^\/processos\//i.test(value) && /href|document|arquivo/i.test(path)) {
    const absoluteUrl = `https://portaldeservicos.pdpj.jus.br/api/v2${value}`;
    if (!urls.includes(absoluteUrl)) urls.push(absoluteUrl);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findDocumentLinks(item, urls, depth + 1, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => findDocumentLinks(item, urls, depth + 1, path ? `${path}.${key}` : key));
  }
  return urls;
}

async function enviarResultadoPdpj(deviceToken: string, cnj: string, documentLinks: string[]): Promise<void> {
  const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/sync/pdpj`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ cnj, documentLinks }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((data.error as string) || `HTTP ${response.status} ao enviar resultado PDPJ`);
  }
}

/** Cria os handlers de pdpj_oab e pdpj_cnj já ligados às dependências do processo principal. */
export function createPdpjTaskHandlers(pairing: Pairing, auth: PdpjAuth) {
  const sessions = new CookieStore();
  const api = new PdpjApiClient(
    () => sessions.getValidSession(),
    (url, authorization) => auth.requestPdpjApi(url, authorization),
  );

  const ensureSession = async (): Promise<void> => {
    if (sessions.getValidSession()?.accessToken) return;
    await auth.ensureApiSession();
    if (!sessions.getValidSession()?.accessToken) {
      throw new PdpjApiError('Sessão PDPJ expirada ou indisponível — faça login novamente.', 401);
    }
  };

  const handlePdpjOab: TaskHandler = async (task: SyncTask, ctx): Promise<TaskHandlerResult> => {
    const state = (task.cursor as OabTaskState | null) ?? null;
    if (!state?.oabNumber || !state.oabUf) {
      return { status: 'failed', errorCode: 'estado_invalido', errorMessage: 'Tarefa pdpj_oab sem OAB/UF no cursor.' };
    }

    try {
      await ensureSession();
    } catch (err: any) {
      return { status: 'paused_login_required', errorCode: 'sessao_expirada', errorMessage: err.message };
    }

    let searchAfter = state.searchAfter ?? undefined;
    let pageCount = state.pageCount ?? 0;
    let recebidos = 0;
    let novos = 0;

    try {
      while (true) {
        let page;
        try {
          page = await api.buscarPorOab(state.oabNumber, state.oabUf, searchAfter);
        } catch (err) {
          if (err instanceof PdpjApiError && err.status === 404) break; // fim normal da paginação
          throw err;
        }

        const deviceToken = pairing.getDeviceToken();
        if (!deviceToken) return { status: 'failed', errorCode: 'sem_pareamento', errorMessage: 'CS não está pareado.' };

        pageCount += 1;
        for (const raw of page.content) {
          const cnjRaw = extractCnj(raw);
          if (!cnjRaw) continue;
          const cnj = cnjRaw.replace(/\D/g, '');
          if (cnj.length !== 20) continue;
          recebidos += 1;
          const created = await createPdpjCnjTask(deviceToken, cnj, task.id);
          if (created) novos += 1;
        }

        searchAfter = page.searchAfter;
        const cursor: OabTaskState = { oabNumber: state.oabNumber, oabUf: state.oabUf, searchAfter, pageCount };
        await ctx.heartbeat(cursor, { paginas: pageCount, recebidos, novos });

        if (!searchAfter?.length || page.content.length === 0) break;
      }

      recordDiagnosticEvent('pdpj_oab_task_finished', 'success', `OAB ${state.oabNumber}/${state.oabUf} varrida`, { pageCount, recebidos, novos });
      return {
        status: 'completed',
        cursor: { oabNumber: state.oabNumber, oabUf: state.oabUf, searchAfter: null, pageCount },
        counters: { paginas: pageCount, recebidos, novos },
      };
    } catch (err: any) {
      const apiError = err instanceof PdpjApiError ? err : new PdpjApiError(err.message);
      if (apiError.status === 401 || apiError.status === 403) {
        return { status: 'paused_login_required', errorCode: 'sessao_expirada', errorMessage: apiError.message };
      }
      return { status: apiError.retryable ? 'paused_rate_limit' : 'failed', errorCode: 'erro_pdpj', errorMessage: apiError.message };
    }
  };

  const handlePdpjCnj: TaskHandler = async (task: SyncTask): Promise<TaskHandlerResult> => {
    const cnj = task.cnj;
    if (!cnj) return { status: 'failed', errorCode: 'sem_cnj', errorMessage: 'Tarefa pdpj_cnj sem CNJ.' };

    try {
      await ensureSession();
    } catch (err: any) {
      return { status: 'paused_login_required', errorCode: 'sessao_expirada', errorMessage: err.message };
    }

    try {
      const details = await api.buscarDetalhes(cnj);
      const documentLinks = findDocumentLinks(details);

      const token = pairing.getDeviceToken();
      if (!token) return { status: 'failed', errorCode: 'sem_pareamento', errorMessage: 'CS não está pareado.' };
      await enviarResultadoPdpj(token, cnj, documentLinks);

      recordDiagnosticEvent('pdpj_cnj_task_finished', 'success', `Detalhe do CNJ ${cnj.slice(-8)} sincronizado`, { documentLinks: documentLinks.length });
      return { status: 'completed', counters: { documentosEncontrados: documentLinks.length } };
    } catch (err: any) {
      const apiError = err instanceof PdpjApiError ? err : new PdpjApiError(err.message);
      if (apiError.status === 401 || apiError.status === 403) {
        return { status: 'paused_login_required', errorCode: 'sessao_expirada', errorMessage: apiError.message };
      }
      return { status: apiError.retryable ? 'paused_rate_limit' : 'failed', errorCode: 'erro_pdpj', errorMessage: apiError.message };
    }
  };

  async function createPdpjCnjTask(deviceToken: string, cnj: string, parentTaskId: string): Promise<boolean> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/tasks/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({
        source: 'pdpj',
        type: 'pdpj_cnj',
        idempotencyKey: `pdpj_cnj:${cnj}`,
        cnj,
        parentTaskId,
        priority: 6,
      }),
    }).catch((err) => {
      logger.warn('[PdpjTasks] Falha ao criar tarefa pdpj_cnj:', err.message);
      return null;
    });
    if (!response || !response.ok) return false;
    const data = await response.json().catch(() => ({ created: false })) as { created?: boolean };
    return Boolean(data.created);
  }

  return { handlePdpjOab, handlePdpjCnj };
}
