/**
 * Loads runtime environment variables for the packaged desktop app.
 *
 * Priority:
 * 1. Existing process.env values
 * 2. .env next to the installed executable / current working directory
 * 3. .env in Electron userData (%APPDATA%/MeuJudi CS/.env)
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const [key, value] = parsed;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadRuntimeEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getPath('userData'), '.env'),
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

loadRuntimeEnv();
