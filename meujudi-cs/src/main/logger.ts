/**
 * MeuJudi Sync — Logger estruturado customizado
 * Saída: console + arquivo em %APPDATA%/meujudi-cs/logs/
 *
 * Implementação customizada (sem dependência do pino que tem tipagem restritiva).
 * Funcionalidades:
 * - Loga no console (com cores em dev)
 * - Escreve em arquivo %APPDATA%/meujudi-cs/logs/{YYYY-MM-DD}.log
 * - Níveis: debug, info, warn, error
 * - Aceita qualquer tipo como argumento (string, object, error)
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DiagnosticEvent } from '../shared/types';

// Cores ANSI
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️ ',
  warn: '⚠️ ',
  error: '❌',
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type RecentLogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
};

const recentLogs: RecentLogEntry[] = [];
const recentEvents: DiagnosticEvent[] = [];
const MAX_RECENT_LOGS = 300;
const MAX_RECENT_EVENTS = 500;

// Cria diretório de logs
const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const isDev = !app.isPackaged;
// Default 'debug': o nível 'debug' é usado pra rastrear navegação durante
// login (did-navigate no pdpj-auth.ts) — é exatamente o dado
// mais útil pra diagnosticar problema de login remotamente. Descartar por
// padrão fazia o relatório enviado pro Supabase perder esse rastro, mesmo
// aparecendo no painel de logs da UI (que usava um buffer separado).
const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'debug';
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL];
}

function formatArgs(args: any[]): { message: string; context?: any } {
  if (args.length === 0) return { message: '' };
  if (args.length === 1) {
    const arg = args[0];
    if (typeof arg === 'string') return { message: arg };
    if (arg instanceof Error) return { message: arg.message, context: { stack: arg.stack, name: arg.name } };
    if (typeof arg === 'object' && arg !== null) {
      return { message: arg.message || JSON.stringify(arg), context: arg };
    }
    return { message: String(arg) };
  }
  // Múltiplos args: primeiro é "label", resto é contexto
  const [first, ...rest] = args;
  if (typeof first === 'string') {
    return { message: first, context: rest.length === 1 ? rest[0] : rest };
  }
  return { message: JSON.stringify(args) };
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeToFile(level: LogLevel, timestamp: string, message: string, context?: any) {
  try {
    const today = timestamp.slice(0, 10);
    const logFile = path.join(logsDir, `${today}.log`);
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    const line = `${timestamp} [${level.toUpperCase()}] ${message}${contextStr}\n`;
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (_err) {
    // Silencioso — não queremos loop de erros no logger
  }
}

function writeToConsole(level: LogLevel, timestamp: string, message: string, context?: any) {
  const time = timestamp.slice(11, 19); // HH:MM:SS
  const color = LEVEL_COLORS[level];
  const icon = LEVEL_ICONS[level];
  const contextStr = context ? ` ${COLORS.cyan}${JSON.stringify(context)}${COLORS.reset}` : '';
  const line = `${COLORS.gray}${time}${COLORS.reset} ${color}${icon} ${level.toUpperCase().padEnd(5)}${COLORS.reset} ${message}${contextStr}`;
  console.log(line);
}

function log(level: LogLevel, ...args: any[]): void {
  if (!shouldLog(level)) return;
  const timestamp = formatTimestamp();
  const { message, context } = formatArgs(args);
  recentLogs.push({ timestamp, level, message: sanitizeMessage(message), context: sanitizeContext(context) });
  if (recentLogs.length > MAX_RECENT_LOGS) recentLogs.shift();
  writeToConsole(level, timestamp, message, context);
  if (!isDev || level !== 'debug') {
    // Em prod, escreve TUDO (info+) em arquivo
    // Em dev, escreve só info+ (debug só no console)
    writeToFile(level, timestamp, message, context);
  }
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/(XSRF-TOKEN=)[^;\s]+/gi, '$1[redacted]')
    .replace(/(JSESSIONID=)[^;\s]+/gi, '$1[redacted]')
    .replace(/(AUTH_SESSION_ID=)[^;\s]+/gi, '$1[redacted]')
    .replace(/(KEYCLOAK_[A-Z_]+=)[^;\s]+/gi, '$1[redacted]')
    .slice(0, 500);
}

function sanitizeContext(context: any): any {
  if (!context) return undefined;
  try {
    const json = JSON.stringify(context, (_key, value) => {
      if (typeof value === 'string') {
        if (value.length > 800) return `${value.slice(0, 800)}...[truncated]`;
        if (/eyJ[A-Za-z0-9_-]+\./.test(value)) return '[jwt-redacted]';
      }
      return value;
    });
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export function getRecentLogs(limit: number = 120): RecentLogEntry[] {
  return recentLogs.slice(-limit);
}

export function recordDiagnosticEvent(
  name: string,
  status: DiagnosticEvent['status'],
  message?: string,
  details?: Record<string, unknown>,
  durationMs?: number
): void {
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    name,
    status,
    message: message ? sanitizeMessage(message) : undefined,
    durationMs,
    details: sanitizeContext(details),
  };
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();
}

export function getRecentDiagnosticEvents(limit: number = 180): DiagnosticEvent[] {
  return recentEvents.slice(-limit);
}

// Palavras-chave pra decidir se uma linha INFO "importa" — WARN/ERROR
// sempre entram, DEBUG nunca entra (é o did-navigate/heartbeat que lota o
// arquivo — achado 13/08/2026: 1 milhão+ de linhas de loop num único dia),
// e INFO só entra se bater com algo que já se mostrou relevante nas
// investigações reais até aqui (login, sessão, Bearer, rate limit).
const IMPORTANT_INFO_MARKERS = [
  'LOGIN PDPJ',
  'SESSÃO PJe SALVA',
  'Sessão deletada',
  'Sessão em disco expirada',
  'validacao da API expirou',
  'Falha na validacao PDPJ',
  'tarefa concluída',
  'destravada(s) apos revalidar',
  'HTTP 429',
  'nenhuma sessao salva disponivel',
];

export interface ExportedLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
}

/**
 * Lê os arquivos de log em disco (não o buffer em memória, que só guarda os
 * últimos 300) e devolve as linhas WARN/ERROR + INFO relevante dentro do
 * período pedido — sempre sanitizado, mesmo o que já foi escrito em disco
 * sem sanitização (`writeToFile` grava a mensagem crua; a sanitização até
 * agora só rodava pro buffer em memória usado pela tela).
 */
export async function getImportantLogEntriesInRange(
  periodStartMs: number,
  periodEndMs: number,
  maxEntries: number = 5000,
): Promise<ExportedLogEntry[]> {
  const readline = await import('readline');
  const files = fs
    .readdirSync(logsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.log$/.test(name))
    .filter((name) => {
      const fileDateMs = Date.parse(`${name.slice(0, 10)}T00:00:00.000Z`);
      // Um arquivo cobre um dia UTC inteiro — inclui se qualquer parte dele
      // cai dentro do período pedido.
      return fileDateMs <= periodEndMs && fileDateMs + 24 * 60 * 60 * 1000 >= periodStartMs;
    })
    .sort();

  const lineRegex = /^(\S+) \[(DEBUG|INFO|WARN|ERROR)\] (.*)$/;
  const entries: ExportedLogEntry[] = [];

  for (const file of files) {
    if (entries.length >= maxEntries) break;
    const filePath = path.join(logsDir, file);
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (entries.length >= maxEntries) { rl.close(); break; }
      const match = lineRegex.exec(line);
      if (!match) continue;
      const [, timestamp, levelUpper, rest] = match;
      const level = levelUpper.toLowerCase() as LogLevel;
      if (level === 'debug') continue;

      const timestampMs = Date.parse(timestamp);
      if (Number.isNaN(timestampMs) || timestampMs < periodStartMs || timestampMs > periodEndMs) continue;

      const isRelevant = level !== 'info' || IMPORTANT_INFO_MARKERS.some((marker) => rest.includes(marker));
      if (!isRelevant) continue;

      const sepIndex = rest.indexOf(' | ');
      const rawMessage = sepIndex === -1 ? rest : rest.slice(0, sepIndex);
      let context: any;
      if (sepIndex !== -1) {
        try { context = JSON.parse(rest.slice(sepIndex + 3)); } catch { context = undefined; }
      }

      entries.push({
        timestamp,
        level,
        message: sanitizeMessage(rawMessage),
        context: sanitizeContext(context),
      });
    }
  }

  return entries;
}

// API exportada (mesmo formato do console, mas com tipos)
export const logger = {
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
  fatal: (...args: any[]) => log('error', ...args), // alias
};

export type Logger = typeof logger;
