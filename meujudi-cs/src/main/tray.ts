/**
 * MeuJudi CS — Tray icon (bandeja do Windows)
 *
 * Ícone fica na bandeja do sistema com menu de contexto:
 * - Conectar ao PJe
 * - Status (Conectado/Desconectado)
 * - Sincronizar agora
 * - Ver logs
 * - Sair
 */

import { Tray, Menu, nativeImage, app, NativeImage, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';
import { APP_NAME, TRAY_STATUS } from '../shared/constants';
import type { TrayStatus } from '../shared/constants';

let tray: Tray | null = null;
let currentStatus: TrayStatus = 'disconnected';

/**
 * Inicializa o tray icon.
 * @param onConnect callback quando usuário clica "Conectar ao PJe"
 * @param onSync callback quando usuário clica "Sincronizar agora"
 * @param onDiagnostic callback quando usuário clica "Executar diagnóstico"
 * @param onLogs callback quando usuário clica "Ver logs"
 * @param onQuit callback quando usuário clica "Sair"
 */
export function initTray(
  onConnect: () => void,
  onSync: () => void,
  onDiagnostic: () => void,
  onLogs: () => void,
  onQuit: () => void,
  onOpenApp: () => void
): void {
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  rebuildMenu(onConnect, onSync, onDiagnostic, onLogs, onQuit, onOpenApp);
  logger.info('Tray icon inicializada');
}

/**
 * Carrega o ícone do tray. Tenta assets/tray-icon.png, fallback pra icon.png.
 */
function loadTrayIcon(): NativeImage {
  const trayPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');

  let imagePath = fs.existsSync(trayPath) ? trayPath : iconPath;

  if (!fs.existsSync(imagePath)) {
    logger.warn('Ícone do tray não encontrado, usando placeholder');
    // Cria imagem 1x1 transparente como fallback
    return nativeImage.createEmpty();
  }

  const image = nativeImage.createFromPath(imagePath);
  // Redimensiona pra 32x32 (tamanho padrão do tray no Windows)
  return image.resize({ width: 32, height: 32 });
}

/**
 * Atualiza o status (cor do ícone, label do tooltip, menu).
 */
export function updateTrayStatus(status: TrayStatus): void {
  currentStatus = status;
  if (!tray) return;

  const statusInfo = TRAY_STATUS[status];
  tray.setToolTip(`${APP_NAME} — ${statusInfo.label}`);

  // TODO: trocar o ícone por uma versão colorida conforme o status
  // Por enquanto, só atualiza o tooltip
  logger.debug('Status atualizado:', status);

  rebuildMenuFromCurrent();
}

/**
 * Reconstrói o menu de contexto (com o status atual).
 */
function rebuildMenuFromCurrent(): void {
  // Não tem como ler o menu atual (Electron não expõe getMenu() no Tray).
  // Solução: rebuildMenu é chamado externamente com as callbacks.
  // Aqui só logamos a mudança de status.
  if (!tray) return;
  const statusInfo = TRAY_STATUS[currentStatus];
  tray.setToolTip(`${APP_NAME} — ${statusInfo.icon} ${statusInfo.label}`);
  logger.debug('Status atualizado:', currentStatus);
}

/**
 * Constrói o menu inicial (chamado uma vez no initTray).
 */
function rebuildMenu(
  onConnect: () => void,
  onSync: () => void,
  onDiagnostic: () => void,
  onLogs: () => void,
  onQuit: () => void,
  onOpenApp: () => void
): void {
  if (!tray) return;

  const statusInfo = TRAY_STATUS[currentStatus];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      id: 'status',
      label: `Status: ${statusInfo.icon} ${statusInfo.label}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      id: 'open-app',
      label: 'Abrir MeuJudi CS',
      click: onOpenApp,
    },
    {
      id: 'connect',
      label: '🔌 Conectar ao PJe',
      click: onConnect,
    },
    {
      id: 'sync',
      label: '🔄 Sincronizar agora',
      click: onSync,
    },
    { type: 'separator' },
    {
      id: 'diagnostic',
      label: '🔍 Executar diagnóstico',
      click: onDiagnostic,
    },
    {
      id: 'logs',
      label: '📋 Ver logs',
      click: onLogs,
    },
    {
      id: 'about',
      label: `ℹ️ Sobre ${APP_NAME} v${app.getVersion()}`,
      click: () => {
        const about = new BrowserWindow({
          width: 400,
          height: 300,
          title: `Sobre ${APP_NAME}`,
          autoHideMenuBar: true,
        });
        about.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <html>
            <body style="font-family: system-ui; padding: 20px; text-align: center;">
              <h1>${APP_NAME}</h1>
              <p>Versão: ${app.getVersion()}</p>
              <p>Plataforma: ${process.platform} (${process.arch})</p>
              <p>Electron: ${process.versions.electron}</p>
              <p>Node: ${process.versions.node}</p>
              <hr>
              <p style="color: #6b7280; font-size: 12px;">
                MeuJudi CS — Cert Service<br>
                © 2026 Caio
              </p>
            </body>
          </html>
        `)}`);
      },
    },
    { type: 'separator' },
    {
      id: 'quit',
      label: '❌ Sair',
      click: onQuit,
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}
