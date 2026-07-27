import Store from 'electron-store';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import { recordDiagnosticEvent } from './logger';
import { MuralClient, type MuralComunicacao } from './mural-client';
import { Pairing } from './pairing';

type Oab = { oab_number: string; oab_uf: string };
type CursorStore = { cursors: Record<string, string> };
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

export class MuralPush {
  private readonly mural = new MuralClient();
  private readonly store = new Store<CursorStore>({ name: 'cs-mural-push', defaults: { cursors: {} } });

  constructor(private readonly pairing: Pairing) {}

  async run(): Promise<{ oabs: number; recebidas: number; enviadas: number }> {
    const token = this.pairing.getDeviceToken();
    if (!token) return { oabs: 0, recebidas: 0, enviadas: 0 };
    const headers = { Authorization: `Bearer ${token}` };
    const oabs = await this.getOabs(headers);
    let recebidas = 0;
    let enviadas = 0;
    const now = new Date();

    for (const oab of oabs) {
      const key = `${oab.oab_number}/${oab.oab_uf}`;
      const cursor = this.store.get('cursors')[key];
      const from = cursor ? new Date(cursor) : new Date(Date.now() - INITIAL_LOOKBACK_MS);
      const items: MuralComunicacao[] = [];
      let latest = cursor ? new Date(cursor) : from;

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await this.mural.buscarPorOAB(oab.oab_number, oab.oab_uf, dateKey(from), dateKey(now), page, PAGE_SIZE);
        const pageItems = response.items ?? [];
        recebidas += pageItems.length;
        items.push(...pageItems);
        for (const item of pageItems) {
          const date = new Date(item.data_disponibilizacao);
          if (!Number.isNaN(date.getTime()) && date > latest) latest = date;
        }
        if (pageItems.length < PAGE_SIZE) break;
      }

      if (items.length > 0) {
        const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/sync/mural`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ comunicacoes: items }),
        });
        const result = await response.json() as { novas?: number; error?: string };
        if (!response.ok) throw new Error(result.error || `Sincronizacao do push HTTP ${response.status}`);
        enviadas += result.novas ?? 0;
      }
      this.store.set('cursors', { ...this.store.get('cursors'), [key]: latest.toISOString() });
    }

    recordDiagnosticEvent('cs_mural_push_finished', 'success', `Push do Mural: ${enviadas} novas`, { oabs: oabs.length, recebidas, enviadas });
    return { oabs: oabs.length, recebidas, enviadas };
  }

  private async getOabs(headers: Record<string, string>): Promise<Oab[]> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oabs`, { headers });
    const data = await response.json() as { oabs?: Oab[]; error?: string };
    if (!response.ok) throw new Error(data.error || `OABs HTTP ${response.status}`);
    return data.oabs ?? [];
  }
}

function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
