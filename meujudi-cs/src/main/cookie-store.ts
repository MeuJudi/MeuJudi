/**
 * MeuJudi Sync — CookieStore
 *
 * Armazena a sessão PJe (cookies + CSRF) criptografada em disco.
 * Usa electron-store com encryptionKey (AES-256-GCM por baixo dos panos).
 * Chave de criptografia única por máquina (node-machine-id).
 */

import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';
import crypto from 'crypto';
import { logger } from './logger';
import type { PdpjSession } from '../shared/types';

// Sessao antiga do PJe nao e reutilizada. O PDPJ possui armazenamento proprio.
const STORE_NAME = 'pdpj-session';
const SALT = 'meujudi-cs-cookies-v1-salt-do-not-change';

export class CookieStore {
  private store: Store<{ session: string | null }>;
  private cachedSession: PdpjSession | null = null;
  private cachedAt: number = 0;
  private readonly CACHE_TTL_MS = 30_000; // 30s

  constructor() {
    // Chave de criptografia única por máquina
    const machineId = machineIdSync();
    const encryptionKey = crypto.scryptSync(machineId, SALT, 32).toString('hex');

    this.store = new Store<{ session: string | null }>({
      name: STORE_NAME,
      encryptionKey,
      clearInvalidConfig: true,
    });

    logger.info('CookieStore inicializado em:', this.store.path);
  }

  // ============================================================
  //  SAVE / LOAD
  // ============================================================

  /**
   * Salva a sessão criptografada em disco.
   */
  saveSession(session: PdpjSession): void {
    this.store.set('session', JSON.stringify(session));
    this.cachedSession = session;
    this.cachedAt = Date.now();
    logger.debug('Sessão salva (cache + disco)');
  }

  /**
   * Retorna a sessão válida (não expirada), ou null.
   *
   * `forceRefresh` pula o cache de 30s e lê direto do disco. Necessário
   * quando outra instância de CookieStore (cada uma tem seu próprio cache
   * em memória, mesmo apontando pro mesmo arquivo) acabou de salvar uma
   * sessão nova — sem isso, um `getValidSession()` chamado logo em
   * seguida podia devolver o valor cacheado antigo (ex.: sem accessToken)
   * mesmo com o token novo já gravado em disco.
   */
  getValidSession(forceRefresh = false): PdpjSession | null {
    // Cache
    if (!forceRefresh && this.cachedSession && Date.now() - this.cachedAt < this.CACHE_TTL_MS) {
      if (this.cachedSession.expiresAt > new Date()) {
        return this.cachedSession;
      }
      return null;
    }

    // Disco
    const raw = this.store.get('session');
    if (!raw) {
      this.cachedSession = null;
      return null;
    }

    try {
      const session: PdpjSession = JSON.parse(raw);
      // Revalida datas (JSON perde o tipo Date)
      session.expiresAt = new Date(session.expiresAt);
      session.createdAt = new Date(session.createdAt);
      session.lastUsedAt = new Date(session.lastUsedAt);

      if (session.expiresAt <= new Date()) {
        logger.info('Sessão em disco expirada, limpando...');
        this.clearSession();
        return null;
      }

      this.cachedSession = session;
      this.cachedAt = Date.now();
      logger.debug('Sessão recuperada do disco');
      return session;
    } catch (err: any) {
      logger.error('Erro ao parsear sessão do disco:', err.message);
      this.clearSession();
      return null;
    }
  }

  /**
   * Verifica se tem sessão válida (sem retornar ela).
   */
  hasValidSession(): boolean {
    return this.getValidSession() !== null;
  }

  /**
   * Invalida só o Bearer (mantém os cookies) — usado quando uma consulta à
   * API falha com 401/403: o cookie ainda pode estar válido, mas o token
   * ficou obsoleto e precisa ser revalidado (ver
   * PdpjAuth.startAutoValidation, que roda em segundo plano).
   */
  clearAccessToken(): void {
    const session = this.getValidSession(true);
    if (!session) return;
    session.accessToken = undefined;
    session.apiValidated = false;
    this.saveSession(session);
    logger.info('Bearer PDPJ invalidado; sessao de cookies mantida pra revalidacao automatica');
  }

  /**
   * Deleta a sessão (do cache + do disco).
   */
  clearSession(): void {
    this.store.set('session', null);
    this.cachedSession = null;
    this.cachedAt = 0;
    logger.info('Sessão deletada');
  }

  /**
   * Atualiza o lastUsedAt (chamado a cada request).
   */
  touch(): void {
    const session = this.getValidSession();
    if (session) {
      session.lastUsedAt = new Date();
      this.saveSession(session);
    }
  }

  // ============================================================
  //  PATH INFO (debug)
  // ============================================================

  /**
   * Retorna o path do arquivo de sessão (pro log/debug).
   */
  getPath(): string {
    return this.store.path;
  }
}
