import { logger } from './logger';
import { PdpjApiError, normalizePage, redactPdpjPath, redactPdpjBody, isRecord, extractCnj } from './pdpj-api-helpers';
import type { PdpjProcessPage } from './pdpj-api-helpers';
import type { PdpjSession } from '../shared/types';

export { PdpjApiError, extractCnj };
export type { PdpjProcessPage };

const PDPJ_API_URL = 'https://portaldeservicos.pdpj.jus.br/api/v2';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

type SessionProvider = () => PdpjSession | null;

export interface PdpjBrowserResponse {
  status: number;
  contentType: string | null;
  body: string;
}

type BrowserRequest = (url: string, authorization: string) => Promise<PdpjBrowserResponse>;

export class PdpjApiClient {
  constructor(
    private readonly getSession: SessionProvider,
    private readonly browserRequest?: BrowserRequest,
  ) {}

  async buscarPorOab(oabNumber: string, oabUf: string, cursor?: string[]): Promise<PdpjProcessPage> {
    const params = new URLSearchParams({ oabRepresentante: `${oabUf.toUpperCase()}${oabNumber.replace(/\D/g, '')}` });
    // O Portal PDPJ envia o cursor como uma lista separada por virgulas.
    // Enviar JSON aqui faz a API responder 404 mesmo quando ainda existem paginas.
    if (cursor?.length) params.set('searchAfter', cursor.join(','));
    return this.normalizePageWithLog(await this.request(`/processos?${params.toString()}`));
  }

  async buscarPorCnj(cnj: string): Promise<PdpjProcessPage> {
    const params = new URLSearchParams({ numeroProcesso: cnj });
    return this.normalizePageWithLog(await this.request(`/processos?${params.toString()}`));
  }

  async buscarDetalhes(cnj: string): Promise<Record<string, unknown>> {
    const body = await this.request(`/processos/${encodeURIComponent(cnj)}`);
    const detail = Array.isArray(body) ? body[0] : body;
    if (!isRecord(detail)) throw new PdpjApiError('Detalhe do processo retornou um formato invalido.', undefined, false);
    return detail;
  }

  async buscarPorCpfCnpj(documento: string): Promise<PdpjProcessPage> {
    const params = new URLSearchParams({ cpfCnpjParte: documento.replace(/\D/g, '') });
    return this.normalizePageWithLog(await this.request(`/processos?${params.toString()}`));
  }

  private normalizePageWithLog(body: unknown): PdpjProcessPage {
    return normalizePage(body, (info) => logger.info('PDPJ API: estrutura da pagina recebida', info));
  }

  private async request(path: string): Promise<unknown> {
    const session = this.getSession();
    if (!session?.accessToken) {
      throw new PdpjApiError('Login PDPJ necessario para consultar processos.', 401);
    }

    let lastError: unknown;
    const cookieHeader = session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        logger.info('PDPJ API: iniciando requisicao', {
          method: 'GET',
          path: redactPdpjPath(path),
          hasBearer: Boolean(session.accessToken),
          bearerLength: session.accessToken?.length ?? 0,
          attempt: attempt + 1,
        });
        const authorization = `${session.tokenType ?? 'Bearer'} ${session.accessToken}`;
        const browserResponse = this.browserRequest
          ? await this.browserRequest(`${PDPJ_API_URL}${path}`, authorization)
          : null;
        const response = browserResponse ? undefined : await fetch(`${PDPJ_API_URL}${path}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: authorization,
            'User-Agent': 'MeuJudi-CS/0.2.18',
            Cookie: cookieHeader,
            Origin: 'https://portaldeservicos.pdpj.jus.br',
            Referer: 'https://portaldeservicos.pdpj.jus.br/consulta',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            skipErrorInterceptor: 'true',
          },
          signal: controller.signal,
        });

        const status = browserResponse ? browserResponse.status : response!.status;
        const contentType = browserResponse ? browserResponse.contentType : response!.headers.get('content-type');
        const responseBody = browserResponse ? browserResponse.body : undefined;
        if (status === 401 || status === 403 || status === 404) {
          const body = responseBody ?? await response!.text();
          logger.warn('PDPJ API: resposta de acesso negado ou recurso ausente', {
            status,
            path: redactPdpjPath(path),
            contentType,
            transport: browserResponse ? 'chromium' : 'node-fetch',
            bodyPreview: redactPdpjBody(body),
          });
          throw new PdpjApiError(`PDPJ respondeu HTTP ${status}.`, status);
        }
        if (status < 200 || status >= 300) {
          const body = responseBody ?? await response!.text();
          logger.warn('PDPJ API: resposta HTTP inesperada', {
            status,
            path: redactPdpjPath(path),
            transport: browserResponse ? 'chromium' : 'node-fetch',
            bodyPreview: redactPdpjBody(body),
          });
          throw new PdpjApiError(`PDPJ respondeu HTTP ${status}.`, status, status >= 500 || status === 429);
        }

        const body = responseBody ? JSON.parse(responseBody) as unknown : await response!.json() as unknown;
        logger.info('PDPJ API: resposta recebida', {
          status,
          path: redactPdpjPath(path),
          transport: browserResponse ? 'chromium' : 'node-fetch',
        });
        return body;
      } catch (error) {
        lastError = error;
        const apiError = error instanceof PdpjApiError
          ? error
          : new PdpjApiError(error instanceof Error && error.name === 'AbortError' ? 'Tempo limite da API PDPJ excedido.' : 'Falha de rede ao consultar o PDPJ.', undefined, true);
        if (!apiError.retryable || attempt === MAX_RETRIES - 1) throw apiError;
        const delay = 500 * 2 ** attempt;
        logger.warn('PDPJ: tentativa temporaria falhou; aguardando retry.', { attempt: attempt + 1, delay, status: apiError.status });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha desconhecida no PDPJ.');
  }
}

