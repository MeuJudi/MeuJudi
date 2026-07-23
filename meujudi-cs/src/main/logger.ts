/**
 * MeuJudi CS — Logger estruturado customizado
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
const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
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
  } catch (err) {
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

// API exportada (mesmo formato do console, mas com tipos)
export const logger = {
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
  fatal: (...args: any[]) => log('error', ...args), // alias
};

export type Logger = typeof logger;
