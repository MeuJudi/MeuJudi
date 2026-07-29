import path from 'path';
import fs from 'fs';
import { nativeImage, NativeImage } from 'electron';

/**
 * Ícone padrão do app (janelas + about), gerado a partir de
 * docs/Logo MeuJudi Sync.svg — ver assets/icon.ico (instalador) e
 * assets/icon.png (janelas/tray). Usado em toda BrowserWindow pra garantir
 * o ícone certo também em `npm run dev` (o instalador já embute o ícone
 * via build.win.icon, mas isso não cobre o processo Electron em si).
 */
export function getAppIconPath(): string {
  return path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

export function loadAppIcon(): NativeImage | undefined {
  const iconPath = getAppIconPath();
  if (!fs.existsSync(iconPath)) return undefined;
  return nativeImage.createFromPath(iconPath);
}
