/**
 * MeuJudi Sync — Exportação de logs sob demanda
 *
 * Nunca envia nada sozinho: só roda quando o usuário escolhe um período na
 * tela e clica em enviar, e só se o Super Admin liberou esse dispositivo
 * especificamente (ver StatusReporter.getConnectionStatus().logUploadEnabled
 * — o botão fica escondido enquanto não for liberado). O servidor confere
 * de novo o mesmo gate antes de aceitar (ver /api/cs/logs/upload).
 */

import { logger, getImportantLogEntriesInRange } from './logger';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import type { Pairing } from './pairing';
import type { LogUploadResult } from '../shared/types';

const TIMEOUT_MS = 30_000;

export async function exportAndSendLogs(pairing: Pairing, periodStartIso: string, periodEndIso: string): Promise<LogUploadResult> {
  const token = pairing.getDeviceToken();
  if (!token) return { sent: false, error: 'Dispositivo não está pareado.' };

  const periodStartMs = Date.parse(periodStartIso);
  const periodEndMs = Date.parse(periodEndIso);
  if (Number.isNaN(periodStartMs) || Number.isNaN(periodEndMs) || periodEndMs <= periodStartMs) {
    return { sent: false, error: 'Período inválido.' };
  }

  const entries = await getImportantLogEntriesInRange(periodStartMs, periodEndMs);
  if (entries.length === 0) {
    return { sent: false, error: 'Nenhum log importante encontrado nesse período.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/logs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ periodStart: periodStartIso, periodEnd: periodEndIso, entries }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 403) {
      return { sent: false, error: 'Envio de logs não está liberado pra este dispositivo. Peça liberação no MeuJudi.' };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json() as { entryCount?: number };
    logger.info('Logs enviados sob demanda pro Supabase', { entryCount: data.entryCount ?? entries.length, periodStartIso, periodEndIso });
    return { sent: true, entryCount: data.entryCount ?? entries.length };
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? 'Tempo limite ao enviar os logs.' : (err?.message || 'Falha ao enviar os logs.');
    logger.warn('Falha ao enviar logs sob demanda', message);
    return { sent: false, error: message };
  }
}
