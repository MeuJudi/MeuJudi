/**
 * MeuJudi CS — helpers puros do fluxo ConfirmADV.
 *
 * Separados do módulo principal para que sejam testáveis sem precisar
 * instanciar o BrowserWindow, a Pairing ou o electron-store.
 *
 * Funções:
 * - `inferEventFromUrl` mapeia a URL atual do ConfirmADV para um evento
 *   reportado ao Web. Quando o padrão não bate, devolve `null` (é
 *   melhor o Web esperar pelo status terminal do que inferir errado).
 * - `extractRequestIdFromUrl` tenta extrair o identificador da
 *   solicitação (ex.: /verification/abc123 → "abc123").
 */

export const CONFIRMADV_BASE = 'https://confirmadv.oab.org.br';

export type ConfirmADVEventHint =
  | 'request_created'
  | 'code_pending'
  | 'verified'
  | 'rejected';

const REQUEST_PATTERNS = ['/confirm', '/solicitacao'];
const CODE_PATTERNS = ['/verification', '/codigo', '/code'];
const SUCCESS_PATTERNS = ['/success', '/aprovado', '/validado'];
const REJECTION_PATTERNS = ['/error', '/recusado', '/rejeitado', '/invalid'];

export function inferEventFromUrl(url: string): ConfirmADVEventHint | null {
  if (!url || !url.startsWith(CONFIRMADV_BASE)) return null;
  const path = url.replace(CONFIRMADV_BASE, '').toLowerCase();
  if (path === '/' || path === '') return null;
  if (REQUEST_PATTERNS.some((p) => path.includes(p))) return 'request_created';
  if (CODE_PATTERNS.some((p) => path.includes(p))) return 'code_pending';
  if (SUCCESS_PATTERNS.some((p) => path.includes(p))) return 'verified';
  if (REJECTION_PATTERNS.some((p) => path.includes(p))) return 'rejected';
  return null;
}

export function extractRequestIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^[A-Za-z0-9-]{6,}$/.test(last)) return last;
  } catch {
    return undefined;
  }
  return undefined;
}
