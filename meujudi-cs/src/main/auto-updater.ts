/**
 * MeuJudi Sync — Atualização automática
 *
 * Usa `electron-updater` (provider "github") apontando pro repo
 * `MeuJudi/MeuJudi-Sync-Releases` — um repo público separado que só
 * guarda os artefatos do instalador (.exe + latest.yml), nunca código do
 * MeuJudi. Público de propósito: o binário do instalador já é o mesmo que
 * qualquer cliente recebe hoje ao instalar o Sync, então não há nada novo
 * sendo exposto, e isso evita precisar embutir qualquer token no app (ver
 * decisão em docs/plano-robustez-cs.md, item 11).
 *
 * O instalador não é assinado digitalmente ainda (item 4 do mesmo doc),
 * por isso `verifyUpdateCodeSignature: false` já está setado no
 * package.json — sem isso o electron-updater recusaria aplicar o update
 * no Windows.
 *
 * Processo de release (manual, sem CI ainda):
 * 1. `npm run dist:win` gera o instalador + `latest.yml` em `release/`.
 * 2. Subir os dois arquivos como assets de um novo Release no repo
 *    `MeuJudi/MeuJudi-Sync-Releases`, com a tag `v<versão>` (igual ao
 *    `version` do package.json).
 */

import { app, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logger, recordDiagnosticEvent } from './logger';
import { APP_NAME, INTERVALS } from '../shared/constants';

let started = false;
// Diferencia uma checagem disparada pelo usuário (menu da bandeja) das
// checagens periódicas silenciosas — só a manual mostra notificação
// quando não tem nada novo ou dá erro, pra não spammar o usuário a cada
// 6h com "você já está atualizado".
let manualCheckInFlight = false;

export function initAutoUpdater(): void {
  if (started) return;
  started = true;

  if (!app.isPackaged) {
    logger.info('Auto-update desabilitado (app não empacotado / modo dev)');
    return;
  }

  autoUpdater.logger = {
    info: (...args: unknown[]) => logger.debug('[auto-updater]', ...args),
    warn: (...args: unknown[]) => logger.warn('[auto-updater]', ...args),
    error: (...args: unknown[]) => logger.error('[auto-updater]', ...args),
    debug: (...args: unknown[]) => logger.debug('[auto-updater]', ...args),
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    recordDiagnosticEvent('auto_update', 'info', `Versão ${info.version} disponível, baixando...`, {
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    logger.debug('Auto-update: nenhuma versão nova disponível');
    if (manualCheckInFlight) {
      manualCheckInFlight = false;
      new Notification({
        title: APP_NAME,
        body: 'Você já está com a versão mais recente instalada.',
        silent: true,
      }).show();
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    recordDiagnosticEvent('auto_update', 'success', `Versão ${info.version} baixada, pronta pra instalar`, {
      version: info.version,
    });
    manualCheckInFlight = false;
    const notification = new Notification({
      title: `${APP_NAME} — Atualização pronta`,
      body: `Versão ${info.version} baixada. Clique aqui pra instalar agora, ou ela instala sozinha na próxima vez que o app reiniciar.`,
      silent: true,
    });
    // Clicar na notificação instala na hora (fecha e reabre o app já
    // atualizado) — sem isso o usuário só tem a opção de esperar o
    // próximo reinício natural do app.
    notification.on('click', () => autoUpdater.quitAndInstall());
    notification.show();
  });

  autoUpdater.on('error', (err) => {
    // Não muda o status pra 'error' (isso é reservado pro status de
    // conexão com o PJe) — só loga. Falha em checar update não deve
    // parecer, pro usuário, que o Sync parou de sincronizar.
    logger.warn('Auto-update: erro ao checar/baixar atualização:', err.message);
    recordDiagnosticEvent('auto_update', 'warning', 'Falha ao checar/baixar atualização', {
      message: err.message,
    });
    if (manualCheckInFlight) {
      manualCheckInFlight = false;
      new Notification({
        title: `${APP_NAME} — Erro ao checar atualização`,
        body: err.message || 'Não foi possível checar se tem uma versão nova.',
        silent: false,
      }).show();
    }
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Auto-update: falha ao iniciar checagem:', err.message);
      manualCheckInFlight = false;
    });
  };

  // Primeira checagem pouco depois do app subir (não compete com o
  // startup), depois periodicamente.
  setTimeout(check, 30_000);
  setInterval(check, INTERVALS.updateCheck);

  logger.info('Auto-update inicializado, checando a cada', INTERVALS.updateCheck / 3_600_000, 'h');
}

/** Checagem manual (menu "Verificar atualização" da bandeja). */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    new Notification({
      title: APP_NAME,
      body: 'Auto-update não funciona em modo desenvolvimento.',
      silent: true,
    }).show();
    return;
  }
  manualCheckInFlight = true;
  autoUpdater.checkForUpdates().catch((err) => {
    manualCheckInFlight = false;
    logger.warn('Auto-update: falha na checagem manual:', err.message);
    new Notification({
      title: `${APP_NAME} — Erro ao checar atualização`,
      body: err.message || 'Não foi possível checar se tem uma versão nova.',
      silent: false,
    }).show();
  });
}
