/**
 * MeuJudi CS — PJeAPI
 *
 * Cliente HTTP puro pra API REST do PJe.
 * Injeta cookies + XSRF automaticamente em cada request.
 *
 * 29 endpoints mapeados (ver shared/constants.ts).
 * Validado com 5 HARs reais do PJe TRT9.
 */

import { logger } from './logger';
import { DEFAULT_TRIBUNAL, PJE_BASE_URLS, USER_AGENT, TIMEOUTS } from '../shared/constants';
import type { PJETribunal } from '../shared/constants';
import type { PJeSession } from '../shared/types';

type SessionProvider = () => PJeSession | null;

export class PJeAPI {
  constructor(private getSession: SessionProvider) {}

  // ============================================================
  //  CORE — call genérico
  // ============================================================

  /**
   * Faz um request autenticado ao PJe.
   * @throws se não houver sessão válida
   */
  async call<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      query?: Record<string, string | number | boolean>;
      tribunal?: PJETribunal;
      skipAuth?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, query, tribunal = DEFAULT_TRIBUNAL, skipAuth = false } = options;

    const session = skipAuth ? null : this.getSession();
    if (!session && !skipAuth) {
      const err = new Error('Não conectado ao PJe — faça login primeiro');
      (err as any).code = 'NOT_CONNECTED';
      throw err;
    }

    const baseUrl = PJE_BASE_URLS[tribunal];
    let url = `${baseUrl}${endpoint}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        params.append(k, String(v));
      }
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': USER_AGENT,
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    };

    if (session) {
      headers['Cookie'] = session.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      headers['x-xsrf-token'] = session.csrfToken;
    }

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.request);

    try {
      logger.debug(`${method} ${url}`);
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        const err = new Error(`Sessão expirada ou sem permissão (HTTP ${response.status})`);
        (err as any).code = 'SESSION_EXPIRED';
        throw err;
      }

      if (!response.ok) {
        const text = await response.text();
        const err = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        (err as any).code = 'NETWORK_ERROR';
        throw err;
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      // Detecta content-type
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }
      if (contentType.includes('application/pdf')) {
        return (await response.arrayBuffer()) as T;
      }
      return (await response.text()) as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const e = new Error(`Timeout ao chamar ${endpoint}`);
        (e as any).code = 'TIMEOUT';
        throw e;
      }
      throw err;
    }
  }

  // ============================================================
  //  ENDPOINTS TIPADOS (pra autocomplete e segurança)
  // ============================================================

  /** GET /pje-comum-api/api/paineladvogado/{id}/processos */
  async getPainelProcessos(
    userId: number,
    options: { pagina?: number; tamanhoPagina?: number; data?: Date } = {}
  ) {
    const { pagina = 1, tamanhoPagina = 10, data } = options;
    return this.call('/pje-comum-api/api/paineladvogado/{id}/processos'.replace('{id}', String(userId)), {
      query: {
        pagina,
        tamanhoPagina,
        tipoPainelAdvogado: 1,
        ordenacaoCrescente: false,
        idPainelAdvogadoEnum: 1,
        ...(data ? { data: data.getTime() } : {}),
      },
    });
  }

  /** GET /pje-comum-api/api/pauta-usuarios-externos */
  async getPauta(
    options: { dataInicio: Date; dataFim: Date; situacao?: string; pagina?: number; tamanhoPagina?: number }
  ) {
    const { dataInicio, dataFim, situacao = 'M', pagina = 1, tamanhoPagina = 50 } = options;
    return this.call('/pje-comum-api/api/pauta-usuarios-externos', {
      query: {
        dataInicio: dataInicio.toISOString().slice(0, 10),
        dataFim: dataFim.toISOString().slice(0, 10),
        codigoSituacao: situacao,
        numeroPagina: pagina,
        tamanhoPagina,
        ordenacao: 'asc',
      },
    });
  }

  /** GET /pje-comum-api/api/paineladvogado/{id}/totalizadores */
  async getPainelTotalizadores(userId: number, tipoPainelAdvogado = 0) {
    return this.call('/pje-comum-api/api/paineladvogado/{id}/totalizadores'.replace('{id}', String(userId)), {
      query: { tipoPainelAdvogado },
    });
  }

  /** GET /pje-comum-api/api/quadroavisos/ */
  async getQuadroAvisos(naoLidos = true, pagina = 1, tamanhoPagina = 10) {
    return this.call('/pje-comum-api/api/quadroavisos/', {
      query: {
        pagina,
        tamanhoPagina,
        exibirApenasAvisosNaoLidos: naoLidos,
      },
    });
  }

  /** GET /pje-seguranca/api/token/perfis */
  async getPerfis(): Promise<any> {
    return this.call<any>('/pje-seguranca/api/token/perfis');
  }

  /** GET /pje-seguranca/api/token/permissoes/recursos */
  async getPermissoes(tipo?: string) {
    return this.call('/pje-seguranca/api/token/permissoes/recursos', {
      query: tipo ? { tipo } : undefined,
    });
  }

  /** GET /pje-comum-api/api/processos/id/{id}/documentos/agrupados */
  async getDocumentosAgrupados(idProcesso: number, processoCompleto = true) {
    return this.call(
      '/pje-comum-api/api/processos/id/{id}/documentos/agrupados'.replace('{id}', String(idProcesso)),
      {
        query: { processoCompleto },
      }
    );
  }

  /** GET /pje-consulta-api/api/processos/{idProcesso}/documentos/{idDocumento} */
  async getDocumento(
    idProcesso: number,
    idDocumento: number,
    tokenCaptcha: string
  ): Promise<ArrayBuffer> {
    return this.call(
      '/pje-consulta-api/api/processos/{idProcesso}/documentos/{idDocumento}'
        .replace('{idProcesso}', String(idProcesso))
        .replace('{idDocumento}', String(idDocumento)),
      {
        query: { tokenCaptcha },
      }
    );
  }

  /** GET /pje-comum-api/api/processos/id/{id}/prioridades/descricao */
  async getPrioridades(idProcesso: number) {
    return this.call(
      '/pje-comum-api/api/processos/id/{id}/prioridades/descricao'.replace('{id}', String(idProcesso))
    );
  }

  /** GET /primeirograu/seam/resource/rest/api/sincronia/sessao */
  async keepalive() {
    return this.call('/primeirograu/seam/resource/rest/api/sincronia/sessao');
  }
}
