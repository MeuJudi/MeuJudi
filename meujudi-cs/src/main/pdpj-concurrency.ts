/**
 * MeuJudi Sync — concorrência do PDPJ ajustável em teste controlado.
 *
 * `SOURCE_CONCURRENCY.pdpj` (sync-worker.ts) e `MAX_QUERY_WINDOWS`
 * (pdpj-auth.ts) eram constantes fixas — pra testar quantas janelas
 * autenticadas simultâneas o PDPJ tolera sem bloquear, cada degrau exigia
 * recompilar e publicar uma versão nova do CS. Agora lê de um arquivo de
 * config local (editável pelo Caio direto, sem precisar de build novo) —
 * ver docs/roadmap se formalizar isso depois.
 *
 * Trava de segurança: um único HTTP 429 (rate limit explícito do PDPJ)
 * força a concorrência de volta pra 1 por `COOLDOWN_MS`, ignorando o que
 * o arquivo de config disser, e avisa via notificação — não fica testando
 * mais alto sozinho depois de um sinal de alerta real.
 */

import { app, Notification } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger, recordDiagnosticEvent } from './logger';
import { APP_NAME } from '../shared/constants';

const CONFIG_FILE_NAME = 'pdpj-test-config.json';
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY_PERMITIDA = 10; // teto de sanidade — nunca le um numero maluco do arquivo
const COOLDOWN_MS = 30 * 60_000; // 30min voltando pra 1 depois de um 429 real

let ultimoAviso429: number | null = null;

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function lerConcorrenciaConfigurada(): number {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { maxConcurrentPdpj?: number };
    const valor = Number(parsed.maxConcurrentPdpj);
    if (Number.isFinite(valor) && valor >= 1) return Math.min(MAX_CONCURRENCY_PERMITIDA, Math.floor(valor));
  } catch {
    // arquivo nao existe ou invalido — usa o padrao, sem quebrar nada.
  }
  return DEFAULT_CONCURRENCY;
}

/** Concorrência efetiva agora — respeita o arquivo de config, exceto durante o cooldown pós-429 (força 1). */
export function getMaxConcurrentPdpj(): number {
  if (ultimoAviso429 !== null && Date.now() - ultimoAviso429 < COOLDOWN_MS) return 1;
  return lerConcorrenciaConfigurada();
}

/**
 * Chamado sempre que o PDPJ responde 429 — ativa o cooldown (força
 * concorrência 1) e avisa o usuário. Não desativa sozinho antes do prazo,
 * mesmo que o arquivo de config seja editado nesse meio-tempo.
 */
export function registrar429PDPJ(): void {
  const jaAvisado = ultimoAviso429 !== null && Date.now() - ultimoAviso429 < COOLDOWN_MS;
  ultimoAviso429 = Date.now();
  logger.error('PDPJ: HTTP 429 recebido — forçando concorrência de volta pra 1 por 30min', {
    configuradoNoArquivo: lerConcorrenciaConfigurada(),
  });
  recordDiagnosticEvent('pdpj_rate_limit_429', 'error', 'PDPJ respondeu 429 (rate limit) — concorrência forçada pra 1 por 30min');
  if (!jaAvisado) {
    try {
      new Notification({
        title: `${APP_NAME} - PDPJ limitou as requisições`,
        body: 'Recebemos HTTP 429 do PDPJ. Reduzindo pra 1 janela simultânea por 30min, por segurança. Considere não testar concorrência mais alta agora.',
        silent: false,
      }).show();
    } catch (error: any) {
      logger.warn('PDPJ: falha ao mostrar notificacao de 429:', error?.message || error);
    }
  }
}
