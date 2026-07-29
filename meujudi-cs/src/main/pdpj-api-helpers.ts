/**
 * MeuJudi Sync — helpers puros do cliente PDPJ.
 *
 * Separados de pdpj-api.ts (que importa `logger`, e esse por sua vez
 * importa `electron`) pra ficarem testáveis com `node tests/*.test.js`
 * sem precisar do runtime do Electron — mesmo padrão de
 * confirmadv-helpers.ts. Ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md
 * Fase 10 ("testes de paginação PDPJ", "ausência de segredo em log/payload").
 */

export class PdpjApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'PdpjApiError';
  }
}

export interface PdpjProcessPage {
  total?: number;
  content: Record<string, unknown>[];
  searchAfter?: string[];
}

/** Nunca deixa número de OAB, CPF/CNPJ ou CNJ em texto puro num log. */
export function redactPdpjPath(path: string): string {
  return path.replace(/(oabRepresentante=)[^&]+/i, '$1[redacted]')
    .replace(/(cpfCnpjParte=)[^&]+/i, '$1[redacted]')
    .replace(/(numeroProcesso=)[^&]+/i, '$1[redacted]');
}

/** Nunca deixa Bearer token nem access_token/refresh_token em texto puro num log. */
export function redactPdpjBody(body: string): string {
  return body
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/("(?:access_token|refresh_token|token)"\s*:\s*")[^"]+/gi, '$1[redacted]')
    .slice(0, 1000);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normaliza uma página de resposta do PDPJ — aceita tanto array puro quanto
 * os formatos observados de envelope (`content`/`data`, `searchAfter` em
 * várias grafias, `total` como número ou `{value}`). `onDebug` é opcional
 * pra quem chama poder logar a forma bruta sem essa função depender de
 * logger nenhum (o que quebraria o teste unitário, que roda fora do
 * Electron).
 */
export function normalizePage(body: unknown, onDebug?: (info: Record<string, unknown>) => void): PdpjProcessPage {
  if (Array.isArray(body)) return { content: body.filter(isRecord) };
  if (!isRecord(body)) throw new PdpjApiError('Resposta PDPJ invalida.', undefined, false);
  onDebug?.({
    topLevelKeys: Object.keys(body).sort(),
    paginationKeys: isRecord(body.pagination) ? Object.keys(body.pagination).sort() : [],
    pageKeys: isRecord(body.page) ? Object.keys(body.page).sort() : [],
    contentCount: Array.isArray(body.content) ? body.content.length : Array.isArray(body.data) ? body.data.length : 0,
  });
  const content = Array.isArray(body.content)
    ? body.content.filter(isRecord)
    : Array.isArray(body.data)
      ? body.data.filter(isRecord)
      : [];
  const rawCursor = body.searchAfter
    ?? body.search_after
    ?? body.nextSearchAfter
    ?? body.next_search_after
    ?? (isRecord(body.pagination) ? body.pagination.searchAfter ?? body.pagination.search_after : undefined);
  const cursor = Array.isArray(rawCursor)
    ? rawCursor.map(String)
    : typeof rawCursor === 'string'
      ? [rawCursor]
      : undefined;
  const totalValue = isRecord(body.total) ? body.total.value : body.total;
  return {
    content,
    total: typeof totalValue === 'number' ? totalValue : undefined,
    searchAfter: cursor,
  };
}

export function extractCnj(record: Record<string, unknown>): string | null {
  const candidates = [record.numeroProcesso, record.nrProcesso, record.numero, record.cnj];
  const value = candidates.find((item) => typeof item === 'string' || typeof item === 'number');
  return value === undefined ? null : String(value);
}
