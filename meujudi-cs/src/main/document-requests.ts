/**
 * MeuJudi Sync — pedidos de documento sob demanda (visualizar/baixar no
 * Web), Fase de Realtime seguro.
 *
 * O Web cria uma linha em `document_fetch_requests` (Server Action
 * `solicitarDocumento`) e o CS acorda quase na hora via Supabase Realtime
 * (`postgres_changes` INSERT), em vez de esperar o poll de 30s da fila
 * normal (`sync-worker.ts`). O socket Realtime é só a campainha — o evento
 * NUNCA é tratado como fonte de verdade: ao acordar, este módulo sempre
 * chama a rota autenticada por device token de sempre
 * (`/api/cs/document-requests/claim`) pra reivindicar o pedido de forma
 * atômica antes de fazer qualquer coisa.
 *
 * Autenticação do socket: um JWT curto (`Pairing.getRealtimeToken()`,
 * emitido pelo Web em `/pair`/`/heartbeat`, escopado ao `tenant_id`) — sem
 * ele, a policy RLS de `document_fetch_requests` não deixaria este device
 * enxergar pedidos de nenhum tenant (nem o próprio). Nunca é usado pra
 * mutação, só pra permitir a assinatura enxergar o INSERT.
 *
 * Único chamador autorizado de `buscarBinarioDocumento`/
 * `requestPdpjApiBinario` — a varredura em lote (`pdpj-tasks.ts`) continua
 * proibida de tocar `hrefBinario` (ver tests/no-secrets-no-pdf.test.js).
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { MEUJUDI_WEB_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/constants';
import { logger, recordDiagnosticEvent } from './logger';
import { PdpjApiClient, PdpjApiError } from './pdpj-api';
import { CookieStore } from './cookie-store';
import type { Pairing } from './pairing';
import type { PdpjAuth } from './pdpj-auth';

// Achado 19/08/2026 (auditoria de logs): delay fixo de 5s sem teto nem
// backoff — num episódio real (13/08/2026) virou 1.040.778 reconexões
// num único dia (o arquivo de log daquele dia chegou a 114MB só por
// causa disso), e ainda intermitente meses depois sem nenhuma correção
// (49.969 em 17/08/2026). Backoff exponencial com teto resolve o volume
// sem nunca desistir de tentar. O reset do backoff só acontece depois de
// ficar conectado de verdade por `STABLE_CONNECTION_RESET_MS` — resetar
// no primeiro `SUBSCRIBED` sozinho não ajuda se a conexão estiver
// "flapping" (sobe e cai em segundos).
const RECONNECT_DELAY_BASE_MS = 5_000;
const RECONNECT_DELAY_MAX_MS = 5 * 60_000;
const STABLE_CONNECTION_RESET_MS = 30_000;
const AUTH_REFRESH_INTERVAL_MS = 60_000;

interface ClaimedRequest {
  id: string;
  processo_documento_id: string;
  cnj: string;
  pdpj_documento_id: string;
  status: string;
}

export class DocumentRequests {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private readonly sessions = new CookieStore();
  private readonly api: PdpjApiClient;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null;
  private authRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private lastAuthedToken: string | null = null;
  private started = false;
  private reconnectAttempts = 0;

  constructor(private readonly pairing: Pairing, private readonly auth: PdpjAuth) {
    this.api = new PdpjApiClient(
      () => this.sessions.getValidSession(),
      undefined,
      (url, authorization) => this.auth.requestPdpjApiBinario(url, authorization),
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
    this.authRefreshTimer = setInterval(() => this.refreshAuthIfChanged(), AUTH_REFRESH_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.authRefreshTimer) { clearInterval(this.authRefreshTimer); this.authRefreshTimer = null; }
    this.teardown();
  }

  private teardown(): void {
    if (this.stabilityTimer) { clearTimeout(this.stabilityTimer); this.stabilityTimer = null; }
    this.channel?.unsubscribe();
    this.channel = null;
    this.client?.removeAllChannels();
    this.client = null;
  }

  private refreshAuthIfChanged(): void {
    const token = this.pairing.getRealtimeToken();
    if (!token) return;
    if (!this.client) { this.connect(); return; }
    if (token !== this.lastAuthedToken) {
      this.client.realtime.setAuth(token);
      this.lastAuthedToken = token;
    }
  }

  private connect(): void {
    if (this.client) return;
    const tenantId = this.pairing.getStatus()?.tenantId;
    const token = this.pairing.getRealtimeToken();
    if (!tenantId || !token) {
      this.scheduleReconnect();
      return;
    }

    // Qualquer excecao aqui (ex.: falha ao montar o client/transporte) nao
    // pode escapar pro processo main do Electron — sem o try/catch ela
    // sobe crua ate o handler global e derruba a janela inteira com o
    // dialog "A JavaScript error occurred in the main process".
    try {
      // O processo main do Electron roda num Node sem WebSocket global (só
      // chegou nativo no Node 22+; Electron 33 embute o Node 20) — sem isso
      // o realtime-js do Supabase lança "Node.js detected but native
      // WebSocket not found" na hora de conectar.
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // O pacote `ws` não implementa o tipo DOM WebSocket exato que o
        // realtime-js espera; é o transporte recomendado pra Node < 22.
        realtime: { transport: WebSocket as any },
      });
      this.client.realtime.setAuth(token);
      this.lastAuthedToken = token;

      this.channel = this.client
        .channel(`document-fetch-requests:${tenantId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'document_fetch_requests', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            const id = (payload.new as { id?: string } | null)?.id;
            if (id) void this.handleIncoming(id);
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.info('DocumentRequests: assinatura Realtime ativa', { tenantId });
            // Só zera o backoff depois de ficar conectado de verdade por um
            // tempo — se a conexão estiver "flapping" (cai de novo em
            // segundos), resetar no SUBSCRIBED sozinho faria o backoff
            // nunca crescer, voltando ao mesmo problema de martelar a cada
            // poucos segundos.
            if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
            this.stabilityTimer = setTimeout(() => {
              this.reconnectAttempts = 0;
              this.stabilityTimer = null;
            }, STABLE_CONNECTION_RESET_MS);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            logger.warn('DocumentRequests: socket Realtime caiu, reconectando', { status, tentativasSeguidas: this.reconnectAttempts + 1 });
            this.teardown();
            this.scheduleReconnect();
          }
        });
    } catch (err: any) {
      logger.warn('DocumentRequests: falha ao conectar no Realtime, tentando de novo em breve', { message: err?.message || String(err) });
      this.teardown();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_DELAY_MAX_MS, RECONNECT_DELAY_BASE_MS * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.started) this.connect();
    }, delay);
  }

  /**
   * Reage à campainha do Realtime indo direto pra rota autenticada por
   * device token — nunca confia no payload do evento pra nada além de
   * "algo mudou, vale a pena checar".
   */
  private async handleIncoming(id: string): Promise<void> {
    const startedAt = Date.now();
    let claimed: ClaimedRequest | null = null;
    try {
      claimed = await this.claim(id);
      if (!claimed) return; // ja reservado por outro device (ou outra corrida), ou nao existe mais

      await this.ensureSession();
      const hrefBinario = `/processos/${claimed.cnj}/documentos/${claimed.pdpj_documento_id}/binario`;
      const base64 = await this.api.buscarBinarioDocumento(hrefBinario);
      await this.uploadDireto(id, base64);
      await this.complete(id, { status: 'done' });

      const durationMs = Date.now() - startedAt;
      recordDiagnosticEvent('document_request_fetched', 'success', 'Documento buscado sob demanda', { requestId: id }, durationMs);
      logger.info('DocumentRequests: documento buscado e enviado', { requestId: id, durationMs });
    } catch (err: any) {
      const message = err?.message || String(err);
      const durationMs = Date.now() - startedAt;
      logger.warn('DocumentRequests: falha ao buscar documento sob demanda', { requestId: id, message });
      recordDiagnosticEvent('document_request_fetched', 'error', message, { requestId: id }, durationMs);
      if (claimed) await this.complete(id, { status: 'failed', errorMessage: message.slice(0, 500) }).catch(() => undefined);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.sessions.getValidSession()?.accessToken) return;
    await this.auth.ensureApiSession();
    if (!this.sessions.getValidSession(true)?.accessToken) {
      throw new PdpjApiError('Sessão PDPJ expirada ou indisponível.', 401);
    }
  }

  private async claim(id: string): Promise<ClaimedRequest | null> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/document-requests/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.pairing.getDeviceToken()}` },
      body: JSON.stringify({ id }),
    });
    if (response.status === 409) return null;
    if (!response.ok) throw new Error(`Falha ao reservar pedido (HTTP ${response.status}).`);
    const data = await response.json() as { request: ClaimedRequest };
    return data.request;
  }

  /**
   * Sobe o PDF direto pro Storage (CS -> Storage), sem passar o binário
   * pelo corpo de uma rota do Next.js — só a URL/token de upload trafegam
   * pelo Vercel, não o arquivo. Removeu um salto inteiro (CS->Vercel->
   * Storage) que, medido em produção, levava ~0,8-1,2s sozinho.
   */
  private async uploadDireto(id: string, base64: string): Promise<void> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/document-requests/${id}/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.pairing.getDeviceToken()}` },
    });
    if (!response.ok) throw new Error(`Falha ao obter URL de upload (HTTP ${response.status}).`);
    const { path, token } = await response.json() as { path: string; token: string };

    if (!this.client) throw new Error('Client Realtime indisponivel pra fazer upload.');
    const bytes = Buffer.from(base64, 'base64');
    const { error } = await this.client.storage
      .from('documentos-temp')
      .uploadToSignedUrl(path, token, bytes, { contentType: 'application/pdf' });
    if (error) throw new Error(`Falha ao subir o documento pro Storage: ${error.message}`);
  }

  private async complete(id: string, body: { status: 'done' } | { status: 'failed'; errorMessage: string }): Promise<void> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/document-requests/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.pairing.getDeviceToken()}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) logger.warn('DocumentRequests: falha ao concluir pedido', { requestId: id, status: response.status });
  }
}
