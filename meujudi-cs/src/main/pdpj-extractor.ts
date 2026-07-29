import { recordDiagnosticEvent } from './logger';
import { PdpjApiClient, PdpjApiError } from './pdpj-api';
import { CookieStore } from './cookie-store';
import { Pairing } from './pairing';
import { PdpjAuth } from './pdpj-auth';

/**
 * Consulta individual/manual do PDPJ — usada pelo painel de teste em
 * sources/pdpj.tsx e pra listar as OABs vinculadas do escritório.
 *
 * A extração em lote por OAB (que antes rodava aqui e gravava um snapshot
 * local em disco) virou tarefa persistente na fila — ver `pdpj-tasks.ts`
 * (Fase 6 de docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md). Esta classe
 * não guarda mais nenhum dado processual local.
 */
export class PdpjExtractor {
  private readonly sessions = new CookieStore();
  private readonly api = new PdpjApiClient(
    () => this.sessions.getValidSession(),
    (url, authorization) => this.auth.requestPdpjApi(url, authorization),
  );

  constructor(private readonly pairing: Pairing, private readonly auth: PdpjAuth) {}

  async getLinkedOabs() {
    return this.pairing.getLinkedOabs();
  }

  async fetchProcessDetails(cnj: string): Promise<Record<string, unknown>> {
    const normalizedCnj = cnj.replace(/\D/g, '');
    if (normalizedCnj.length !== 20) throw new Error('Informe um CNJ valido com 20 digitos.');
    if (!this.sessions.getValidSession()?.accessToken) await this.auth.ensureApiSession();
    if (!this.sessions.getValidSession()?.accessToken) {
      throw new PdpjApiError('A sessao PDPJ expirou ou nao pode ser atualizada automaticamente. Faca o login novamente.', 401);
    }

    recordDiagnosticEvent('pdpj_process_details_started', 'started', 'Consulta individual PDPJ iniciada', {
      cnjSuffix: normalizedCnj.slice(-8),
    });
    try {
      const details = await this.api.buscarDetalhes(normalizedCnj);
      recordDiagnosticEvent('pdpj_process_details_finished', 'success', 'Consulta individual PDPJ concluida', {
        cnjSuffix: normalizedCnj.slice(-8),
        topLevelKeys: Object.keys(details).sort(),
      });
      return details;
    } catch (error) {
      const apiError = error instanceof PdpjApiError ? error : new PdpjApiError(error instanceof Error ? error.message : 'Falha na consulta individual PDPJ.');
      recordDiagnosticEvent('pdpj_process_details_failed', 'error', apiError.message, {
        cnjSuffix: normalizedCnj.slice(-8),
        status: apiError.status,
      });
      throw apiError;
    }
  }
}
