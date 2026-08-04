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
 *   `processos` e, pra cada documento em `detail.documentos[]` (campo
 *   confirmado via captura de tráfego real do Portal PDPJ), busca o texto
 *   pelo `hrefTexto` — nunca pelo `hrefBinario` (esse só é repassado como
 *   link de download, o CS nunca baixa o PDF) — com até
 *   `MAX_QUERY_WINDOWS` buscas em paralelo (pool de janelas em
 *   pdpj-auth.ts). Manda tudo pra `POST /api/cs/sync/pdpj`, que persiste,
 *   roda Regex e aplica prazo/audiência na Agenda (Fase 8 estendida,
 *   decisão de 29/07/2026). Metadados de classe/órgão/partes continuam de
 *   fora do lado do CS — quem extrai isso do texto é o Web, via
 *   `src/lib/regex/pdpj-documentos.ts`.
 */

import { MEUJUDI_WEB_URL } from '../shared/constants';
import { logger, recordDiagnosticEvent } from './logger';
import { PdpjApiClient, PdpjApiError, PDPJ_API_URL, extractCnj } from './pdpj-api';
import { extractDocumentos, isAcessoNegadoProcessoEspecifico, isRecord } from './pdpj-api-helpers';
import type { PdpjDocumentoRef } from './pdpj-api-helpers';
import { CookieStore } from './cookie-store';
import type { Pairing } from './pairing';
import { getMaxQueryWindows } from './pdpj-auth';
import type { PdpjAuth } from './pdpj-auth';
import type { TaskHandler, TaskHandlerResult } from './sync-worker';
import type { SyncTask } from '../shared/types';

interface OabTaskState {
  oabNumber: string;
  oabUf: string;
  searchAfter?: string[] | null;
  pageCount?: number;
}

// Sem risco de a tarefa "expirar": o heartbeat automático (a cada 4min,
// ver sync-worker.ts) renova o lease de 10min do servidor durante toda a
// execução, não importa quantos documentos existam. O limite real é outro —
// todo request ao PDPJ passa pelo pool de janelas Chromium autenticadas
// (requestPdpjApi, até MAX_QUERY_WINDOWS em paralelo); um processo com
// milhares de documentos ainda monopolizaria esse pool e atrasaria as
// outras tarefas da fila. 200 cobre qualquer processo real sem esse risco.
const MAX_DOCUMENTOS_POR_PROCESSO = 200;
const MAX_TEXTO_CHARS = 200_000;

/** Roda `fn` sobre `items` com no máximo `limite` execuções simultâneas — usado pra casar com o pool de janelas do PDPJ (nunca mais chamadas em voo do que janelas disponíveis). */
async function mapComConcorrencia<T, R>(items: T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let indice = 0;
  async function worker() {
    while (indice < items.length) {
      const atual = indice++;
      resultados[atual] = await fn(items[atual], atual);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return resultados;
}

interface DocumentoParaEnviar {
  pdpjDocumentoId: string;
  url: string | null;
  nome: string | null;
  tipo: string | null;
  dataHoraJuntada: string | null;
  texto: string | null;
}

/**
 * "Pulo inteligente" (docs/roadmap/24-crons-sincronizacao-automatica-
 * pdpj.md) — pergunta pro Web quais documentos (por `pdpjDocumentoId`, o
 * UUID estável do documento no Codex do PDPJ) já são conhecidos antes de
 * gastar baixando texto de documento nenhum. Antes essa checagem usava
 * hash da URL de `hrefBinario` — documento só com `hrefTexto` (sem link de
 * binário) nunca tinha hash pra checar, então era rebuscado pra sempre, do
 * zero, em toda sincronização do CNJ (achado 31/07/2026, apos o Caio pedir
 * pra cada documento só ser extraido uma vez). `pdpjDocumentoId` existe
 * pros dois casos, entao cobre 100% dos documentos agora.
 *
 * Falha de rede aqui não derruba a tarefa: devolve vazio (trata tudo como
 * novo), o pior caso é reprocessar documento que já tinha, nunca perder
 * documento novo.
 */
async function buscarDocumentosConhecidos(deviceToken: string, cnj: string, documentIds: string[]): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set();
  try {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/sync/pdpj/documentos-conhecidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ cnj, documentIds }),
    });
    if (!response.ok) return new Set();
    const data = (await response.json()) as { conhecidos?: string[] };
    return new Set(data.conhecidos ?? []);
  } catch (err: any) {
    logger.warn('[PdpjTasks] Falha ao pré-checar documentos conhecidos; seguindo sem pular nenhum', { cnjSuffix: cnj.slice(-8), message: err?.message });
    return new Set();
  }
}

async function enviarResultadoPdpj(deviceToken: string, cnj: string, documentos: DocumentoParaEnviar[]): Promise<void> {
  const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/sync/pdpj`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ cnj, documentos }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((data.error as string) || `HTTP ${response.status} ao enviar resultado PDPJ`);
  }
}

/**
 * Busca o texto de um documento sem derrubar a tarefa inteira se um
 * documento específico falhar (peça sigilosa, endpoint fora do ar pra
 * aquele item, etc.) — loga e segue pros próximos.
 */
async function buscarTextoComTolerancia(api: PdpjApiClient, cnj: string, doc: PdpjDocumentoRef): Promise<string | null> {
  if (!doc.hrefTexto) return null;
  try {
    const texto = await api.buscarTextoDocumento(doc.hrefTexto);
    if (!texto) return null;
    return texto.length > MAX_TEXTO_CHARS ? texto.slice(0, MAX_TEXTO_CHARS) : texto;
  } catch (err: any) {
    logger.warn('[PdpjTasks] Falha ao buscar texto de documento; seguindo sem ele', {
      cnjSuffix: cnj.slice(-8),
      docId: doc.id,
      message: err?.message,
    });
    return null;
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
    // forceRefresh=true: `ensureApiSession()` salva a sessão nova através da
    // instância própria de CookieStore do PdpjAuth — sem isso, o cache de
    // 30s desta instância (`sessions`) podia devolver o valor antigo (sem
    // accessToken) mesmo com o token já gravado em disco.
    if (!sessions.getValidSession(true)?.accessToken) {
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
      if (isAcessoNegadoProcessoEspecifico(apiError)) {
        // Bearer valido, só esse processo/OAB especifico que o PDPJ nega —
        // nao é sessao morta, entao NAO limpa o Bearer (limpar aqui derrubava
        // uma sessao que estava funcionando, achado 31/07/2026).
        return { status: 'failed', errorCode: 'sem_acesso_pdpj', errorMessage: apiError.serverMessage ?? apiError.message };
      }
      if (apiError.status === 401 || apiError.status === 403) {
        sessions.clearAccessToken();
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
      // Diagnostico temporario (29/07/2026, 2a rodada): a 1a hipotese
      // (documentos dentro de tramitacaoAtual) tambem nao bateu —
      // documentosEncontrados continuou 0. Em vez de adivinhar de novo,
      // mapeia as chaves de CADA objeto/array aninhado (1 nivel), achando
      // qualquer "documentos"/"anexos" por aí. Nunca loga valor, so nomes
      // de chave e tamanho de array.
      {
        const mapaChaves = (value: unknown): unknown => {
          if (Array.isArray(value)) {
            return { tipo: 'array', tamanho: value.length, primeiroItemChaves: isRecord(value[0]) ? Object.keys(value[0]).sort() : typeof value[0] };
          }
          if (isRecord(value)) {
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Array.isArray(v) ? { tipo: 'array', tamanho: v.length } : isRecord(v) ? { tipo: 'objeto', chaves: Object.keys(v).sort() } : typeof v]));
          }
          return typeof value;
        };
        logger.info('PDPJ: mapa de chaves da resposta de detalhes (diagnostico)', {
          cnjSuffix: cnj.slice(-8),
          mapa: mapaChaves(details),
        });
        // Diagnostico temporario (04/08/2026): confirmar o shape de
        // classe/assunto/partes/distribuicao/tribunal antes de extrair e
        // gravar autor/reu/classe/tribunal em `processos` — hoje esses
        // metadados nunca são extraídos do lado do CS (só documentos), então
        // processo descoberto via PDPJ fica sem autor/reu até algum
        // documento de texto mencionar as partes (nem sempre acontece).
        // mapaChaves só expande 1 nível, então chamar de novo direto em
        // tramitacaoAtual (em vez de details) dá o shape de CADA um desses
        // campos, incluindo as chaves do primeiro item de partes[].
        const tramitacaoAtual = isRecord(details.tramitacaoAtual) ? details.tramitacaoAtual : null;
        if (tramitacaoAtual) {
          logger.info('PDPJ: mapa de chaves de tramitacaoAtual (diagnostico)', {
            cnjSuffix: cnj.slice(-8),
            mapa: mapaChaves(tramitacaoAtual),
          });
          // 2a rodada (04/08/2026): classe/assunto/distribuicao/partes vieram
          // como array na 1a rodada, então mapaChaves(tramitacaoAtual) só deu
          // {tipo, tamanho} pra eles — chamar direto no array (em vez de no
          // objeto que o contém) ativa o outro branch de mapaChaves, que
          // inclui as chaves do primeiro item.
          for (const campo of ['classe', 'assunto', 'distribuicao', 'partes'] as const) {
            const valor = (tramitacaoAtual as Record<string, unknown>)[campo];
            if (Array.isArray(valor) && valor.length > 0) {
              logger.info(`PDPJ: mapa de chaves de tramitacaoAtual.${campo} (diagnostico)`, {
                cnjSuffix: cnj.slice(-8),
                mapa: mapaChaves(valor),
              });
            }
          }
        }
      }
      const documentos = extractDocumentos(details).slice(0, MAX_DOCUMENTOS_POR_PROCESSO);
      const token = pairing.getDeviceToken();
      if (!token) return { status: 'failed', errorCode: 'sem_pareamento', errorMessage: 'CS não está pareado.' };

      // Pulo inteligente por `doc.id` (UUID estável do documento no Codex
      // do PDPJ, extraído de hrefBinario OU hrefTexto) — cobre TODO
      // documento, não só os que têm link de binário pra hashear.
      const conhecidos = await buscarDocumentosConhecidos(token, cnj, documentos.map((doc) => doc.id));
      const documentosNovos = documentos.filter((doc) => !conhecidos.has(doc.id));

      if (documentos.length > 0 && documentosNovos.length === 0) {
        // Nada novo — completa sem baixar texto de ninguém.
        recordDiagnosticEvent('pdpj_cnj_task_finished', 'success', `CNJ ${cnj.slice(-8)} sem documento novo, pulado`, {
          documentosVerificados: documentos.length,
        });
        return { status: 'completed', counters: { documentosEncontrados: 0, textosLidos: 0, jaConhecidos: documentos.length } };
      }

      const textos = await mapComConcorrencia(documentosNovos, getMaxQueryWindows(), (doc) => buscarTextoComTolerancia(api, cnj, doc));
      const textosLidos = textos.filter(Boolean).length;
      const documentosParaEnviar: DocumentoParaEnviar[] = documentosNovos.map((doc, indice) => ({
        pdpjDocumentoId: doc.id,
        url: doc.hrefBinario ? `${PDPJ_API_URL}${doc.hrefBinario}` : null,
        nome: doc.nome,
        tipo: doc.tipo,
        dataHoraJuntada: doc.dataHoraJuntada,
        texto: textos[indice],
      }));

      await enviarResultadoPdpj(token, cnj, documentosParaEnviar);

      recordDiagnosticEvent('pdpj_cnj_task_finished', 'success', `Detalhe do CNJ ${cnj.slice(-8)} sincronizado`, {
        documentosEncontrados: documentosParaEnviar.length,
        textosLidos,
      });
      return { status: 'completed', counters: { documentosEncontrados: documentosParaEnviar.length, textosLidos } };
    } catch (err: any) {
      const apiError = err instanceof PdpjApiError ? err : new PdpjApiError(err.message);
      if (isAcessoNegadoProcessoEspecifico(apiError)) {
        return { status: 'failed', errorCode: 'sem_acesso_pdpj', errorMessage: apiError.serverMessage ?? apiError.message };
      }
      if (apiError.status === 401 || apiError.status === 403) {
        sessions.clearAccessToken();
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
