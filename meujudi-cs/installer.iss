; MeuJudi Sync — Script Inno Setup
; Gera o instalador MeuJudi-Sync-Setup.exe (~50 MB)
;
; Compilar com: iscc installer.iss (após npm run dist)

[Setup]
AppName=MeuJudi Sync
AppVersion=0.3.0
AppPublisher=MeuJudi
AppPublisherURL=https://meujudi.com.br
AppSupportURL=https://meujudi.com.br/suporte
AppUpdatesURL=https://meujudi.com.br/atualizacoes
AppId={{COMPUTER_NAME}-MEUJUDI-CS
AppCopyright=Copyright (C) 2026 Caio
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma
SolidCompression=yes
DefaultDirName={autopf}\MeuJudi\MeuJudi Sync
DisableProgramGroupPage=yes
LicenseFile=
OutputBaseFilename=MeuJudi-Sync-Setup
OutputDir=release
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\MeuJudi-Sync.exe
UninstallDisplayName=MeuJudi Sync
VersionInfoVersion=0.3.0
VersionInfoCompany=MeuJudi
VersionInfoDescription=MeuJudi Sync
VersionInfoProductName=MeuJudi Sync
VersionInfoProductVersion=0.3.0

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
WelcomeLabel2=Esse assistente irá guiá-lo durante a instalação do [name/ver].%n%nMeuJudi Sync conecta seu escritório ao PJe (Tribunal) usando seu certificado digital A1 ou gov.br.%n%nOs dados ficam criptografados no seu computador.%n%nClique em Avançar para continuar.

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na &Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked
Name: "startmenu"; Description: "Criar atalho no &Menu Iniciar"; GroupDescription: "Atalhos:"; Flags: checked

[Files]
Source: "dist\MeuJudi-Sync.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\locales\*"; DestDir: "{app}\locales"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\swiftshader\*"; DestDir: "{app}\swiftshader"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\MeuJudi Sync"; Filename: "{app}\MeuJudi-Sync.exe"; Tasks: desktopicon
Name: "{autostartmenu}\MeuJudi Sync"; Filename: "{app}\MeuJudi-Sync.exe"; Tasks: startmenu
Name: "{autostartmenu}\MeuJudi Sync (Desconectar)"; Filename: "{app}\MeuJudi-Sync.exe"; Parameters: "--disconnect"

[Run]
Filename: "{app}\MeuJudi-Sync.exe"; Description: "Abrir MeuJudi Sync"; Flags: nowait postinstall skipifsilent
