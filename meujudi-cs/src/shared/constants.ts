/**
 * MeuJudi Sync — Constantes globais
 * URLs, timeouts, paths padrão.
 */

export const APP_NAME = 'MeuJudi Sync';
export const APP_FULL_NAME = 'Sincronização do escritório com o MeuJudi';
export const APP_VERSION = '0.3.0';
export const USER_AGENT = 'MeuJudi-Sync/1.0 (compatible; Electron)';
export const MEUJUDI_WEB_URL = process.env.MEUJUDI_WEB_URL || 'https://www.meujudi.com.br';

/**
 * URLs do PJe (por tribunal).
 * Sprint 1: só TRT9. Outros tribunais = próximos sprints.
 */
export const PJE_BASE_URLS = {
  trt9: 'https://pje.trt9.jus.br',
  trf4: 'https://pje.trf4.jus.br',
  // trt1, trt2, ... adicionar conforme for implementando
} as const;

export type PJETribunal = keyof typeof PJE_BASE_URLS;

export const DEFAULT_TRIBUNAL: PJETribunal = 'trt9';

/**
 * Endpoints do PJe mapeados (29 do TRT9).
 * Ver Investigação/Descoberta-API-PJe-TRT9.md pra referência.
 */
export const PJE_ENDPOINTS = {
  // pje-comum-api (24 endpoints)
  painelProcessos: '/pje-comum-api/api/paineladvogado/{id}/processos',
  painelTotalizadores: '/pje-comum-api/api/paineladvogado/{id}/totalizadores',
  painelOrgaosJulgadores: '/pje-comum-api/api/paineladvogado/{id}/orgaojulgadores',
  painelClassesJudiciais: '/pje-comum-api/api/paineladvogado/{id}/classesjudiciais',
  painelFasesProcessuais: '/pje-comum-api/api/paineladvogado/{id}/fasesprocessuais',
  pautaUsuariosExternos: '/pje-comum-api/api/pauta-usuarios-externos',
  processoPrioridades: '/pje-comum-api/api/processos/id/{id}/prioridades/descricao',
  processoDocumentosAgrupados: '/pje-comum-api/api/processos/id/{id}/documentos/agrupados',
  quadroAvisos: '/pje-comum-api/api/quadroavisos/',
  periciasTotal: '/pje-comum-api/api/pericias/total',
  usuariosFotoPerfil: '/pje-comum-api/api/usuarios/fotoperfil',
  orgaosJulgadores: '/pje-comum-api/api/orgaosjulgadores',
  fusoHorario: '/pje-comum-api/api/fusohorario',
  dominioClassesJudiciais: '/pje-comum-api/api/dominio/classesjudiciais',
  dominioTiposAudiencias: '/pje-comum-api/api/dominio/tiposaudiencias',
  dominioSituacoesAudiencias: '/pje-comum-api/api/dominio/situacoesaudiencias',
  parametrosConsultaProcessualHome: '/pje-comum-api/api/parametros/PARAMETRO_CONSULTA_PROCESSUAL_HOME',
  parametrosExepjeHome: '/pje-comum-api/api/parametros/PARAMETRO_EXEPJE_HOME',
  parametrosHabilitaModuloExepjekz: '/pje-comum-api/api/parametros/PARAMETRO_HABILITA_MODULO_EXEPJEKZ',
  parametrosQtdeRegistrosPagina: '/pje-comum-api/api/parametros/PARAMETRO_QTDE_REGISTROS_PAGINA',
  parametrosHabilitaPautaInteligente: '/pje-comum-api/api/parametros/PARAMETRO_HABILITA_PAUTA_INTELIGENTE',
  parametrosConsultaProcessualTerceiroHome: '/pje-comum-api/api/parametros/PARAMETRO_CONSULTA_PROCESSUAL_TERCEIRO_HOME',
  parametrosHabilitaConsultaPorNomeDaPartePainelAdvogado: '/pje-comum-api/api/parametros/PARAMETRO_HABILITA_CONSULTA_POR_NOME_DA_PARTE_PAINEL_ADVOGADO',
  parametrosSistemaProducao: '/pje-comum-api/api/parametros/sistema/producao',
  parametrosDownloadCompletoUsandoKz: '/pje-comum-api/api/parametros/PARAMETRO_DOWNLOAD_COMPLETO_USANDO_KZ',

  // pje-seguranca (2 endpoints)
  tokenPermissoes: '/pje-seguranca/api/token/permissoes/recursos',
  tokenPerfis: '/pje-seguranca/api/token/perfis',

  // pje-consulta-api (1 endpoint)
  consultaDocumento: '/pje-consulta-api/api/processos/{idProcesso}/documentos/{idDocumento}',

  // Backend antigo Seam/RichFaces (1 endpoint)
  sincroniaSessao: '/primeirograu/seam/resource/rest/api/sincronia/sessao',
} as const;

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
 * URL que indica login completo (did-navigate target).
 */
export const PJE_LOGGED_IN_PATTERN = /\/painel\/usuario-externo/;

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
