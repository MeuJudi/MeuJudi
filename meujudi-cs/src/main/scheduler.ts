import { logger } from './logger';
import { MuralSync } from './mural-sync';
import { Pairing } from './pairing';

export interface SyncResult {
  processos: number;
  pecas: number;
  durationMs: number;
  mural?: { oabs: number; recebidas: number; novas: number; puladas: number; erros: number } | null;
}

export class Scheduler {
  constructor(private readonly pairing = new Pairing(), private readonly muralSync = new MuralSync(pairing)) {}

  async tickNow(): Promise<SyncResult> {
    const start = Date.now();
    logger.info('Sync manual iniciado');
    const mural = await this.muralSync.tick();
    // A sincronizacao real do PJe continua fora deste escopo; o CS ja faz o
    // login e mantem a sessao, mas ainda nao envia os processos ao Web.
    return { processos: 0, pecas: 0, mural, durationMs: Date.now() - start };
  }
}
