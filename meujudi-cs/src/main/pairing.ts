import Store from 'electron-store';
import { decryptObject, encryptObject } from '../shared/crypto';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import type { PairingInfo } from '../shared/types';
import { logger, recordDiagnosticEvent } from './logger';

type PairingStore = { payload: string | null };

export class Pairing {
  private readonly store = new Store<PairingStore>({ name: 'cs-pairing', defaults: { payload: null } });

  // Token curto pro Realtime (ver src/lib/cs/realtime-token.ts no Web) —
  // só em memória, nunca no disco. Vem de /pair e é renovado a cada
  // /heartbeat (StatusReporter chama setRealtimeToken).
  private realtimeToken: string | null = null;

  async pair(codigo: string): Promise<PairingInfo> {
    const startedAt = Date.now();
    recordDiagnosticEvent('cs_pairing_started', 'started', 'Pareamento do CS iniciado');
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Name': process.env.COMPUTERNAME || 'MeuJudi Sync' },
      body: JSON.stringify({ codigo: codigo.trim().toUpperCase() }),
    });
    const data = await response.json() as Record<string, string>;
    if (!response.ok || !data.device_token || !data.device_id) {
      recordDiagnosticEvent('cs_pairing_failed', 'error', data.error || `HTTP ${response.status}`, undefined, Date.now() - startedAt);
      throw new Error(data.error || 'Nao foi possivel parear este dispositivo.');
    }
    const info: PairingInfo = { deviceToken: data.device_token, deviceId: data.device_id, tenantId: data.tenant_id, tenantName: data.tenant_name, userName: data.user_name, pairedAt: new Date().toISOString() };
    this.store.set('payload', encryptObject(info));
    if (data.realtime_token) this.realtimeToken = data.realtime_token;
    recordDiagnosticEvent('cs_pairing_succeeded', 'success', `Pareado com ${info.tenantName}`, { tenantId: info.tenantId }, Date.now() - startedAt);
    logger.info('CS pareado com tenant:', info.tenantName);
    return info;
  }

  setRealtimeToken(token: string): void { this.realtimeToken = token; }
  getRealtimeToken(): string | null { return this.realtimeToken; }
  getDeviceId(): string | null { return this.getStatus()?.deviceId ?? null; }

  getStatus(): PairingInfo | null {
    const payload = this.store.get('payload');
    if (!payload) return null;
    try { return decryptObject<PairingInfo>(payload); } catch (error) { logger.error('Token de pareamento invalido, limpando:', error); this.store.set('payload', null); return null; }
  }

  isPaired() { return this.getStatus() !== null; }
  getDeviceToken() { return this.getStatus()?.deviceToken ?? null; }
  async unpair() { this.store.set('payload', null); this.realtimeToken = null; recordDiagnosticEvent('cs_unpaired', 'info', 'Pareamento removido localmente'); }
}
