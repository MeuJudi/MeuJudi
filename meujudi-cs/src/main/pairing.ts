import Store from 'electron-store';
import { decryptObject, encryptObject } from '../shared/crypto';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import type { PairingInfo } from '../shared/types';
import { logger, recordDiagnosticEvent } from './logger';

type PairingStore = { payload: string | null };

export class Pairing {
  private readonly store = new Store<PairingStore>({ name: 'cs-pairing', defaults: { payload: null } });

  async pair(codigo: string): Promise<PairingInfo> {
    const startedAt = Date.now();
    recordDiagnosticEvent('cs_pairing_started', 'started', 'Pareamento do CS iniciado');
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Name': process.env.COMPUTERNAME || 'MeuJudi CS' },
      body: JSON.stringify({ codigo: codigo.trim().toUpperCase() }),
    });
    const data = await response.json() as Record<string, string>;
    if (!response.ok || !data.device_token) {
      recordDiagnosticEvent('cs_pairing_failed', 'error', data.error || `HTTP ${response.status}`, undefined, Date.now() - startedAt);
      throw new Error(data.error || 'Nao foi possivel parear este dispositivo.');
    }
    const info: PairingInfo = { deviceToken: data.device_token, tenantId: data.tenant_id, tenantName: data.tenant_name, userName: data.user_name, pairedAt: new Date().toISOString() };
    this.store.set('payload', encryptObject(info));
    recordDiagnosticEvent('cs_pairing_succeeded', 'success', `Pareado com ${info.tenantName}`, { tenantId: info.tenantId }, Date.now() - startedAt);
    logger.info('CS pareado com tenant:', info.tenantName);
    return info;
  }

  getStatus(): PairingInfo | null {
    const payload = this.store.get('payload');
    if (!payload) return null;
    try { return decryptObject<PairingInfo>(payload); } catch (error) { logger.error('Token de pareamento invalido, limpando:', error); this.store.set('payload', null); return null; }
  }

  isPaired() { return this.getStatus() !== null; }
  getDeviceToken() { return this.getStatus()?.deviceToken ?? null; }
  async unpair() { this.store.set('payload', null); recordDiagnosticEvent('cs_unpaired', 'info', 'Pareamento removido localmente'); }
}
