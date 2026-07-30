/**
 * MeuJudi Sync — grava o ícone no .exe empacotado via rcedit local.
 *
 * `build.win.signAndEditExecutable` do electron-builder fica `false`
 * porque, sem certificado de assinatura, o passo `sign()` que ele roda
 * logo depois do rcedit baixa o pacote `winCodeSign` — e a extração desse
 * pacote (7z com symlinks pra libs do macOS) falha nesta máquina sem
 * Developer Mode/admin ("Cannot create symbolic link"). O rcedit em si
 * não precisa de nada disso: o pacote `rcedit` (devDependency) já traz o
 * `rcedit-x64.exe` pronto. Esse hook roda esse rcedit direto no exe
 * gerado, sem passar pelo caminho de assinatura do electron-builder.
 */
const path = require('path');
const { rcedit } = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  await rcedit(exePath, { icon: iconPath });
};
