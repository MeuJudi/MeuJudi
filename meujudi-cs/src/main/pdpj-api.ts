import { logger } from './logger';
import { registrar429PDPJ } from './pdpj-concurrency';
import { PdpjApiError, normalizePage, redactPdpjPath, redactPdpjBody, isRecord, extractCnj } from './pdpj-api-helpers';
import type { PdpjProcessPage } from './pdpj-api-helpers';
import type { PdpjSession } from '../shared/types';

export { PdpjApiError, extractCnj };
export type { PdpjProcessPage };

export const PDPJ_API_URL = 'https://portaldeservicos.pdpj.jus.br/api/v2';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

type SessionProvider = () => PdpjSession | null;

export interface PdpjBrowserResponse {
  status: number;
  contentType: string | null;
  body: string;
}

export interface PdpjBrowserBinaryResponse {
  status: number;
  contentType: string | null;
  base64: string;
}

type BrowserRequest = (url: string, authorization: string) => Promise<PdpjBrowserResponse>;
type BrowserRequestBinario = (url: string, authorization: string) => Promise<PdpjBrowserBinaryResponse>;

export class PdpjApiClient {
  constructor(
    private readonly getSession: SessionProvider,
    private readonly browserRequest?: BrowserRequest,
    private readonly browserRequestBinario?: BrowserRequestBinario,
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

  /**
   * Busca o texto de um documento pelo `hrefTexto` confirmado na resposta de
   * `buscarDetalhes` (nunca pelo `hrefBinario` — esse é só repassado como
   * link de download, o CS nunca o busca). Content-type do `/texto` nunca
   * foi observado ao vivo, então trata a resposta como texto puro por
   * padrão e só desembrulha se vier um JSON reconhecível.
   */
  async buscarTextoDocumento(hrefTexto: string): Promise<string> {
    const raw = await this.request(hrefTexto.startsWith('/') ? hrefTexto : `/${hrefTexto}`, { parseJson: false });
    return unwrapTexto(typeof raw === 'string' ? raw : '');
  }

  /**
   * Busca o PDF de UM documento pelo `hrefBinario`, sob demanda — nunca
   * usado pela varredura em lote (ver tests/no-secrets-no-pdf.test.js e
   * meujudi-cs/src/main/document-requests.ts, o único chamador). Devolve
   * base64 (não Buffer) porque o `executeJavaScript` do Electron não
   * consegue trazer um Buffer/Blob bruto de volta pro processo main.
   */
  async buscarBinarioDocumento(hrefBinario: string): Promise<string> {
    if (!this.browserRequestBinario) throw new PdpjApiError('Busca de binario nao configurada.', undefined, false);
    const session = this.getSession();
    if (!session?.accessToken) throw new PdpjApiError('Login PDPJ necessario para buscar o documento.', 401);

    const path = hrefBinario.startsWith('/') ? hrefBinario : `/${hrefBinario}`;
    const authorization = `${session.tokenType ?? 'Bearer'} ${session.accessToken}`;
    logger.info('PDPJ API: iniciando busca de binario sob demanda', { path: redactPdpjPath(path), hasBearer: true });

    const result = await this.browserRequestBinario(`${PDPJ_API_URL}${path}`, authorization);
    if (result.status === 401 || result.status === 403 || result.status === 404) {
      throw new PdpjApiError(`PDPJ respondeu HTTP ${result.status}.`, result.status);
    }
    if (result.status < 200 || result.status >= 300) {
      throw new PdpjApiError(`PDPJ respondeu HTTP ${result.status}.`, result.status, result.status >= 500 || result.status === 429);
    }
    return result.base64;
  }

  private normalizePageWithLog(body: unknown): PdpjProcessPage {
    return normalizePage(body, (info) => logger.info('PDPJ API: estrutura da pagina recebida', info));
  }

  private async request(path: string, options?: { parseJson?: boolean }): Promise<unknown> {
    const parseJson = options?.parseJson ?? true;
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
            Accept: parseJson ? 'application/json, text/plain, */*' : 'text/plain, application/json, */*',
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
          throw new PdpjApiError(`PDPJ respondeu HTTP ${status}.`, status, false, extractServerMessage(body));
        }
        if (status < 200 || status >= 300) {
          const body = responseBody ?? await response!.text();
          logger.warn('PDPJ API: resposta HTTP inesperada', {
            status,
            path: redactPdpjPath(path),
            transport: browserResponse ? 'chromium' : 'node-fetch',
            bodyPreview: redactPdpjBody(body),
          });
          // 429 é sinal real de rate limit — trava a concorrência de volta
          // pra 1 (ver pdpj-concurrency.ts), independente de teste manual
          // de concorrência mais alta estar rolando ou não.
          if (status === 429) registrar429PDPJ();
          throw new PdpjApiError(`PDPJ respondeu HTTP ${status}.`, status, status >= 500 || status === 429);
        }

        const body = parseJson
          ? (responseBody ? JSON.parse(responseBody) as unknown : await response!.json() as unknown)
          : (responseBody ?? await response!.text());
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

/** Extrai o campo `message` do corpo de erro do PDPJ (ex.: `{"message":"Usuário não possui acesso ao processo X",...}`), se der pra parsear. */
function extractServerMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A resposta de `/texto` nunca foi observada ao vivo (só confirmamos que o
 * campo `hrefTexto` existe na resposta de detalhes). Desembrulha caso venha
 * como JSON `{ texto | conteudo | content | text }`; senão assume que já é
 * texto puro.
 */
function unwrapTexto(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') return parsed.trim();
    if (isRecord(parsed)) {
      const candidate = parsed.texto ?? parsed.conteudo ?? parsed.content ?? parsed.text;
      if (typeof candidate === 'string') return candidate.trim();
    }
  } catch {
    // não é JSON — já é texto puro, segue com o valor original.
  }
  return trimmed;
}

