/**
 * MeuJudi CS â€” Types compartilhados
 * Interfaces usadas entre main process, preload e renderer.
 */

import type { PJETribunal } from './constants';

/**
 * SessÃ£o autenticada no PJe (cookies + CSRF token + expiraÃ§Ã£o).
 * Persistida criptografada em disco via electron-store.
 */
export interface PJeSession {
  tribunal: PJETribunal;
  userId: number;              // id do advogado logado (185531 no caso do LuÃ­s Fellype)
  cookies: SerializedCookie[];
  csrfToken: string;            // valor do cookie XSRF-TOKEN
  expiresAt: Date;              // quando a sessÃ£o expira
  createdAt: Date;
  lastUsedAt: Date;
}

export interface SerializedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expirationDate?: number;
}

/**
 * Status atual da conexÃ£o com o PJe.
 * Retornado pro renderer via IPC.
 */
export type PJeStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; session: PublicSession }
  | { state: 'error'; message: string };

/**
 * SessÃ£o sem dados sensÃ­veis (pra mandar pro renderer).
 */
export interface PublicSession {
  tribunal: PJETribunal;
  userId: number;
  userName?: string;            // nome do advogado (opcional, pra UI)
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  timeRemainingMs: number;      // expiresAt - now
}

/**
 * Processo retornado pela API paineladvogado/.../processos.
 * Ver InvestigaÃ§Ã£o/Descoberta-API-PJe-TRT9.md.
 */
export interface PJeProcesso {
  id: number;
  numero: number;
  numeroProcesso: string;        // "0001909-16.2025.5.09.0652"
  classeJudicial: string;        // "ATOrd"
  descricaoOrgaoJulgador: string;
  codigoStatusProcesso: string;   // "DISTRIBUIDO"
  prioridadeProcessual: number;
  segredoDeJustica: boolean;
  juizoDigital: boolean;
  nomeParteAutora: string;
  qtdeParteAutora: number;
  nomeParteRe: string;
  qtdeParteRe: number;
  dataAutuacao: string;          // ISO 8601
  dataArquivamento?: string;
  dataProximaAudiencia?: string;
  temAssociacao: boolean;
}

/**
 * AudiÃªncia retornada pela API pauta-usuarios-externos.
 */
export interface PJeAudiencia {
  id: number;
  dataInicio: string;            // "2026-08-13T13:10:00"
  dataFim: string;
  salaAudiencia: { nome: string };
  status: string;                // "M" = designada
  statusDescricao: string;
  processo: {
    id: number;
    numero: string;
    classeJudicial: {
      codigo: string;
      descricao: string;
      sigla: string;
      pisoValorCausa?: number;
      tetoValorCausa?: number;
    };
    segredoDeJustica: boolean;
    juizoDigital: boolean;
    orgaoJulgador: { id: number; descricao: string };
  };
  tipo: { id: number; descricao: string; codigo: string };
  poloAtivo: { nome: string; polo: string };
  poloPassivo: { nome: string; polo: string };
  nrProcesso: string;
  idProcesso: number;
}

/**
 * Log estruturado (enviado pro Supabase + UI).
 */
export interface LogEntry {
  timestamp: string;              // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}

/**
 * Metadados de um regex (sistema de 3 estados).
 */
export type RegexState = 'NOVO' | 'QUENTE' | 'CONFIÃVEL';

export interface RegexMetadata {
  id: string;
  padrao: string;
  estado: RegexState;
  usos: number;
  acertos: number;
  ultimaValidacao?: string;
  taxaAcerto: number;            // acertos / usos
}

/**
 * Erro retornado pro renderer (com mensagem amigÃ¡vel).
 */
export interface PJeError {
  code: 'NOT_CONNECTED' | 'SESSION_EXPIRED' | 'NETWORK_ERROR' | 'INVALID_CERT' | 'UNKNOWN';
  message: string;
  originalError?: string;
  retryable: boolean;
}

/**
 * IPC API exposta pro renderer via preload.
 */
export interface ElectronAPI {
  pje: {
    showLoginWindow: () => Promise<PublicSession>;
    getStatus: () => Promise<PJeStatus>;
    disconnect: () => Promise<void>;
    syncNow: () => Promise<{ processos: number; pecas: number; durationMs: number }>;
    getLogs: (limit?: number) => Promise<LogEntry[]>;
  };
  diagnostic: {
    run: () => Promise<DiagnosticReport>;
    sendToSupabase: (report: DiagnosticReport) => Promise<{ sent: boolean; id?: string; error?: string }>;
    getLast: () => Promise<DiagnosticReport | null>;
  };
  app: {
    getVersion: () => Promise<string>;
    openLogsFolder: () => Promise<void>;
  };
  pairing: {
    submitCode: (codigo: string) => Promise<PairingInfo>;
    getStatus: () => Promise<PairingInfo | null>;
    unpair: () => Promise<void>;
  };
  mural: {
    syncHistorical: () => Promise<HistoricalSyncResult | null>;
    getHistoricalStatus: () => Promise<HistoricalSyncStatus>;
  };
}

export interface HistoricalSyncResult {
  oabs: number;
  recebidas: number;
  novas: number;
  puladas: number;
  erros: number;
  semanas: number;
  retomada: boolean;
}

export interface HistoricalSyncStatus {
  running: boolean;
  checkpoint: { taskIndex: number; counters: Omit<HistoricalSyncResult, 'semanas' | 'retomada'>; startedAt: string; completedAt?: string; current?: { oab: string; uf: string; from: string; to: string; page: number; totalTasks: number } } | null;
}

export interface PairingInfo {
  deviceToken: string;
  tenantId: string;
  tenantName: string;
  userName: string;
  pairedAt: string;
}

// ============================================================
//  DIAGNOSTIC TYPES
// ============================================================

/**
 * InformaÃ§Ãµes do cert. A1 detectado no Windows.
 */
export interface CertA1Info {
  found: boolean;
  subject?: string;          // "LUÃS FELLYPE DE ARAÃšJO:12345678900"
  cpf?: string;              // "12345678900"
  issuer?: string;           // "CN=AC OAB G3"
  validFrom?: string;        // ISO 8601
  validTo?: string;          // ISO 8601
  expired?: boolean;
  daysToExpire?: number;
  hasPrivateKey?: boolean;
  thumbprint?: string;
  error?: string;            // erro se nÃ£o conseguiu detectar
}

/**
 * Resultado do teste de conexÃ£o com PJe.
 */
export interface PJeConnectionTest {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Resultado da tentativa de login (sem UI).
 */
export interface PJeLoginTest {
  attempted: boolean;
  succeeded: boolean;
  durationMs?: number;
  urlAfterLogin?: string;
  userId?: number;
  error?: string;
  errorCode?: 'NOT_CONNECTED' | 'SESSION_EXPIRED' | 'NETWORK_ERROR' | 'INVALID_CERT' | 'PJE_LOGIN_FAILED' | 'TIMEOUT' | 'CANCELLED' | 'UNKNOWN';
}

/**
 * Resultado da detecÃ§Ã£o do popup do cert. A1.
 */
export interface CertPopupTest {
  appeared: boolean;          // popup do Windows apareceu?
  cancelled: boolean;         // advogado cancelou?
  autoSelected: boolean;      // cert. foi auto-selecionado?
  durationMs?: number;
  error?: string;
}

/**
 * Resultado da extraÃ§Ã£o de cookies.
 */
export interface CookiesTest {
  count: number;
  hasSession: boolean;        // tem JSESSIONID/AUTH_SESSION_ID?
  hasXsrf: boolean;           // tem XSRF-TOKEN?
  cookieNames?: string[];     // nomes dos cookies (sem valores)
}

export interface DiagnosticEvent {
  timestamp: string;
  name: string;
  status: 'started' | 'success' | 'warning' | 'error' | 'skipped' | 'info';
  message?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

/**
 * RelatÃ³rio completo do diagnÃ³stico.
 * Enviado pro Supabase (sem dados sensÃ­veis) e salvo localmente.
 */
export interface DiagnosticReport {
  // Metadata
  id: string;                 // UUID
  timestamp: string;          // ISO 8601
  meuJudiVersion: string;
  electronVersion: string;
  nodeVersion: string;
  windowsVersion: string;
  arch: string;               // 'x64' ou 'ia32'
  hostname: string;           // nome do PC (anÃ´nimo)
  triggerReason?: string;
  
  // Testes
  certA1: CertA1Info;
  pjeConnection: PJeConnectionTest;
  certPopup: CertPopupTest;
  pjeLogin: PJeLoginTest;
  cookies: CookiesTest;
  
  // Summary
  overallSuccess: boolean;    // tudo funcionou?
  errors: string[];           // lista consolidada de erros
  warnings: string[];         // lista consolidada de avisos
  recommendations: string[];  // sugestÃµes pro Caio melhorar o CS
  recentLogs?: LogEntry[];
  recentEvents?: DiagnosticEvent[];
  probableCause?: string;
  nextAction?: string;
  technicalSummary?: Record<string, unknown>;
}

/**
 * Schema do banco Supabase pra tabela `diagnostic_reports`.
 */
export interface DiagnosticReportDB {
  id: string;
  created_at: string;
  meu_judi_version: string;
  electron_version: string;
  windows_version: string;
  hostname: string;
  overall_success: boolean;
  cert_a1_found: boolean;
  cert_a1_cpf: string | null;
  cert_a1_expired: boolean | null;
  pje_reachable: boolean | null;
  pje_login_succeeded: boolean | null;
  pje_user_id: number | null;
  cert_popup_appeared: boolean | null;
  cert_popup_cancelled: boolean | null;
  cookies_count: number | null;
  cookies_has_session: boolean | null;
  cookies_has_xsrf: boolean | null;
  total_errors: number;
  total_warnings: number;
  trigger_reason?: string | null;
  report_json: any;           // full report (jsonb)
}
