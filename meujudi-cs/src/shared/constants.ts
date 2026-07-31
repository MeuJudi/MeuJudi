/**
 * MeuJudi Sync — Constantes globais
 * URLs, timeouts, paths padrão.
 */

export const APP_NAME = 'MeuJudi Sync';
export const APP_FULL_NAME = 'Sincronização do escritório com o MeuJudi';
export const APP_VERSION = '0.3.6';
export const USER_AGENT = 'MeuJudi-Sync/1.0 (compatible; Electron)';
export const MEUJUDI_WEB_URL = process.env.MEUJUDI_WEB_URL || 'https://www.meujudi.com.br';

// Chave anon/publishable — segura pra embutir num app desktop (é o que o
// próprio navegador usaria); nunca a service_role. Usada só pro socket do
// Supabase Realtime (document-requests.ts); toda mutação continua pelas
// rotas /api/cs/* autenticadas por device token.
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lsuhkzvbzgkbjyfuppeg.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_TH3aLztSSpaAJ_tKym-ewg_F1ZxYofZ';

/**
 * URL inicial do login — via PDPJ (Jus.br), não mais via Keycloak direto.
 *
 * Histórico: antes, montávamos a URL do OIDC do Keycloak na mão (client_id +
 * redirect_uri pro /pjekz/ do tribunal). Isso funcionou por um tempo, mas
 * desde que o acesso de usuário externo passou a ser exclusivamente via
 * PDPJ-Br (abr/2025) e o MFA por e-mail virou obrigatório (nov/2025, com
 * enforcement mais amplo a partir de abr/2026), esse atalho direto passou a
 * cair em "/pjekz/acesso-negado" mesmo com o certificado e o SSO
 * funcionando (confirmado nos logs em 27/07/2026 — ver
 * docs/roadmap/raspador-pdpj.md no repo do Web). A porta de entrada real
 * agora é o jus.br — o próprio site cuida do redirecionamento (incluindo
 * MFA quando exigido) e devolve o usuário pro PJe do tribunal já
 * autorizado.
 */
export const PDPJ_LOGIN_URL = 'https://www.jus.br';
export const PDPJ_PORTAL_URL = 'https://portaldeservicos.pdpj.jus.br';
export const PDPJ_API_BASE_URL = `${PDPJ_PORTAL_URL}/api/v2`;

/**
 * Timeouts (em ms).
 */
export const TIMEOUTS = {
  request: 30_000,           // 30s pra qualquer request HTTP
  login: 10 * 60_000,        // 10min pro login completo (gov.br pode pedir cadastro)
  pdfDownload: 120_000,      // 2min pra PDFs grandes (35MB)
  keepalive: 30 * 60 * 1000, // 30min entre keepalives
} as const;

/**
 * Intervalos de polling (em ms).
 */
export const INTERVALS = {
  heartbeat: 5 * 60 * 1000,         // 5min para indicar que o CS continua online
  polling: 60 * 60 * 1000,        // 1h entre polls
  keepalive: 30 * 60 * 1000,      // 30min entre keepalives
  downloadAll: 24 * 60 * 60 * 1000, // 1x por dia
  retryBackoff: [1000, 2000, 4000, 8000, 16000, 30000], // backoff exponencial
  muralSync: '0 6 * * 1',
  pdpjApiValidation: 5 * 60 * 1000, // 5min — verifica em segundo plano se o Bearer da API PDPJ precisa ser revalidado
  updateCheck: 6 * 60 * 60 * 1000, // 6h — verifica se tem versão nova no repo de releases
} as const;

/**
 * Paths padrão no Windows.
 */
export const PATHS = {
  appData: '%APPDATA%/meujudi-cs',
  sessionFile: 'session.dat',
  logsDir: 'logs',
  cacheDir: 'cache',
  pdfsCache: 'cache/pdfs',
  textCache: 'cache/text',
} as const;

/**
 * Cores e labels dos status do tray icon.
 */
export const TRAY_STATUS = {
  connected: { color: '#10b981', label: 'Conectado', icon: '🟢' },
  connecting: { color: '#f59e0b', label: 'Conectando...', icon: '🟡' },
  error: { color: '#ef4444', label: 'Erro', icon: '🔴' },
  disconnected: { color: '#6b7280', label: 'Desconectado', icon: '⚪' },
} as const;

export type TrayStatus = keyof typeof TRAY_STATUS;
