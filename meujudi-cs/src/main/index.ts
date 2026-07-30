/**
 * MeuJudi Sync — Electron main process entry point
 *
 * Responsabilidades:
 * - Criar a tray icon (bandeja do Windows)
 * - Gerenciar o ciclo de vida do app
 * - Inicializar o scheduler (polling 1x/hora, keepalive 30min)
 * - Configurar auto-start com Windows
 * - Inicializar electron-store
 * - Registrar IPC handlers (renderer <-> main)
 * - Rodar diagnóstico automático na 1ª execução
 */

import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import './env';
import { logger } from './logger';
import { initTray, updateTrayStatus } from './tray';
import { loadAppIcon } from './app-icon';
import { registerIPCHandlers } from './ipc-handlers';
import { Diagnostic } from './diagnostic';
import { Pairing } from './pairing';
import { StatusReporter } from './status-reporter';
import { initAutoUpdater, checkForUpdatesManually } from './auto-updater';
import { APP_NAME, APP_VERSION } from '../shared/constants';
import type { TrayStatus } from '../shared/constants';

let mainWindow: BrowserWindow | null = null;
const pairing = new Pairing();
const statusReporter = new StatusReporter(pairing);
let csRuntime: ReturnType<typeof registerIPCHandlers> | null = null;

logger.info(`${APP_NAME} v${APP_VERSION} iniciando...`);

/**
 * Single instance lock — garante que só 1 MeuJudi Sync roda por vez.
 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('Outra instância já está rodando. Saindo...');
  app.quit();
} else {
  app.on('second-instance', () => {
    logger.info('Segunda instância detectada, abrindo janela de login...');
    import('./pdpj-auth').then(({ PdpjAuth }) => {
      new PdpjAuth().showLoginWindow().catch((err) => {
        logger.error('Erro ao abrir janela de login:', err);
      });
    });
  });

  // Quando o Electron termina de inicializar
  app.whenReady().then(() => {
    // Registra IPC handlers (deve ser antes de qualquer janela abrir)
    csRuntime = registerIPCHandlers(pairing, statusReporter);

    // Auto-start com Windows (minimizado direto na bandeja)
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    });

    // Inicializa a tray icon
    initTray(
      () => openLoginWindow(),
      () => syncNow(),
      () => runDiagnostic(),
      () => openLogsWindow(),
      () => {
        app.quit();
      },
      () => openAppWindow(),
      () => checkForUpdatesManually()
    );

    // Mantem o Web informado sobre a presenca deste dispositivo pareado.
    statusReporter.start();

    initAutoUpdater();

    openAppWindow();

    // Status inicial: verifica se já tem sessão salva
    import('./pdpj-auth').then(({ PdpjAuth }) => {
      const auth = new PdpjAuth();
      auth.getStatus().then((status) => {
        if (status.state === 'connected') {
          logger.info('Sessão PJe já existe, marcando como conectado');
          updateTrayStatus('connected');
        } else {
          updateTrayStatus('disconnected');
        }
      });
    });

    // ======== DIAGNÓSTICO AUTOMÁTICO NA 1ª EXECUÇÃO ========
    const isFirstRun = process.argv.includes('--first-run');
    if (isFirstRun) {
      logger.info('Primeira execução detectada — agendando diagnóstico...');
      // Espera 3s pro app terminar de inicializar
      setTimeout(() => {
        runDiagnostic({ showNotification: true, isFirstRun: true });
      }, 3000);
    }

    // Notificação de boas-vindas (1x só, na primeira instalação)
    if (isFirstRun) {
      setTimeout(() => {
        new Notification({
          title: APP_NAME,
          body: 'App instalado com sucesso! Estamos rodando um diagnóstico automático...',
          silent: false,
        }).show();
      }, 1000);
    }

    logger.info('App pronto. Tray icon ativa.');

    // Em macOS, re-cria janela quando ícone do dock é clicado
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        // Não cria janela principal automaticamente — app é só tray
      }
    });
  });

  // Fecha o app quando todas as janelas forem fechadas (mas mantém na bandeja)
  app.on('window-all-closed', () => {
    // Não fecha o app — fica na bandeja
  });

  // Antes de fechar, cleanup
  app.on('before-quit', () => {
    csRuntime?.stop();
    csRuntime = null;
    statusReporter.stop();
    logger.info('App fechando...');
  });

  // Quando recebe comando de abrir URL (deep linking, futuro)
  app.on('open-url', (event, url) => {
    event.preventDefault();
    logger.info('URL recebida:', url);
  });
}

/**
 * Abre a janela OAuth-like de login no PJe.
 */
async function openLoginWindow(): Promise<void> {
  updateTrayStatus('connecting');
  try {
    const { PdpjAuth } = await import('./pdpj-auth');
    const auth = new PdpjAuth();
    const session = await auth.showLoginWindow();
    logger.info('Login PJe realizado com sucesso', { userId: session.userId });
    updateTrayStatus('connected');
    new Notification({
      title: `${APP_NAME} - Conectado!`,
      body: `Login realizado. Sessão expira em ${Math.round(session.timeRemainingMs / 3600000)}h.`,
      silent: true,
    }).show();
  } catch (err: any) {
    logger.error('Erro no login:', err);
    await runDiagnostic({
      showNotification: false,
      triggerReason: 'pje_login_failed',
      loginFailureMessage: err.message || 'Erro desconhecido no login PJe',
    });
    updateTrayStatus('error');
    new Notification({
      title: `${APP_NAME} - Erro no login`,
      body: err.message || 'Não foi possível conectar ao PJe. Tente novamente.',
      silent: false,
    }).show();
  }
}

/** Abre a interface principal local do CS, incluida no instalador. */
function openAppWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: APP_NAME,
    icon: loadAppIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererPath = path.join(app.getAppPath(), 'src', 'renderer', 'out', 'index.html');
  mainWindow.loadFile(rendererPath).catch((error) => {
    logger.error('Erro ao abrir interface do CS:', error);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/**
 * Dispara o worker unificado (botão "Sincronizar agora" do menu da bandeja)
 * — mesmo ciclo que a Home e o botão "Verificar agora" do Mural disparam.
 */
async function syncNow(): Promise<void> {
  if (!csRuntime) return;
  updateTrayStatus('connecting');
  try {
    const result = await csRuntime.triggerSync();
    logger.info('Sincronização manual concluída', result);
    updateTrayStatus('connected');
    new Notification({
      title: `${APP_NAME} - Sincronização concluída`,
      body: result.tasksTotal > 0
        ? `${result.tasksCompleted} concluída(s), ${result.tasksFailed} falhou(aram), ${result.tasksPaused} pausada(s)`
        : 'Nenhuma tarefa pendente na fila no momento.',
      silent: true,
    }).show();
  } catch (err: any) {
    logger.error('Erro na sincronização:', err);
    updateTrayStatus('error');
  }
}

/**
 * Roda diagnóstico completo e notifica o resultado.
 */
async function runDiagnostic(
  options: {
    showNotification?: boolean;
    isFirstRun?: boolean;
    triggerReason?: string;
    loginFailureMessage?: string;
  } = {}
): Promise<void> {
  const {
    showNotification = true,
    isFirstRun = false,
    triggerReason = isFirstRun ? 'first_run' : 'manual',
    loginFailureMessage,
  } = options;
  logger.info('Iniciando diagnóstico...');
  updateTrayStatus('connecting');

  try {
    const diagnostic = new Diagnostic();
    const report = await diagnostic.run(triggerReason, loginFailureMessage);

    // Log do resumo
    logger.info('Diagnóstico concluído:', {
      certFound: report.certA1.found,
      pjeReachable: report.pjeConnection.reachable,
      hasCookies: report.cookies.hasSession,
      loginOk: report.pjeLogin.succeeded,
      errors: report.errors.length,
      warnings: report.warnings.length,
    });

    if (showNotification) {
      const status = report.overallSuccess ? '✅ Tudo OK' : '⚠️ Alguns problemas';
      const summary = [
        `Cert. A1: ${report.certA1.found ? (report.certA1.expired ? '❌ Expirado' : '✅ OK') : '❌ Não encontrado'}`,
        `PJe: ${report.pjeConnection.reachable ? '✅ Online' : '❌ Offline'}`,
        `Cookies: ${report.cookies.hasSession ? '✅ ' + report.cookies.count : '⚠️ Nenhum'}`,
        `Erros: ${report.errors.length}`,
      ].join(' | ');

      new Notification({
        title: `${APP_NAME} - Diagnóstico ${status}`,
        body: `${summary}${isFirstRun ? '\n\nRelatório enviado automaticamente pro Caio.' : ''}`,
        silent: false,
      }).show();
    }

    updateTrayStatus(report.overallSuccess ? 'connected' : 'error');
  } catch (err: any) {
    logger.error('Erro no diagnóstico:', err);
    updateTrayStatus('error');
    if (showNotification) {
      new Notification({
        title: `${APP_NAME} - Erro no diagnóstico`,
        body: err.message || 'Erro desconhecido ao rodar diagnóstico',
        silent: false,
      }).show();
    }
  }
}

/**
 * Abre pasta de logs (debug).
 */
async function openLogsWindow(): Promise<void> {
  const { shell } = await import('electron');
  const logsPath = app.getPath('userData') + '\\logs';
  await shell.openPath(logsPath);
}

// Exporta tipo pra preload usar
export type { TrayStatus };
