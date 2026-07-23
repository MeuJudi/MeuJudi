; Template versionado para builds que usam Inno Setup.
; Os arquivos Electron ficam em ../meujudi-cs e nao sao versionados aqui.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppName=MeuJudi CS
AppVersion={#AppVersion}
AppPublisher=MeuJudi
AppPublisherURL=https://meujudi.com.br
AppId={{COMPUTER_NAME}-MEUJUDI-CS
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma
SolidCompression=yes
DefaultDirName={autopf}\MeuJudi\MeuJudi CS
OutputDir=..\meujudi-cs\release
OutputBaseFilename=MeuJudi-CS-Setup-v{#AppVersion}
SetupIconFile=..\meujudi-cs\assets\icon.ico

[Files]
Source: "..\meujudi-cs\dist\MeuJudi-CS.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\meujudi-cs\dist\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\meujudi-cs\dist\locales\*"; DestDir: "{app}\locales"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\MeuJudi CS"; Filename: "{app}\MeuJudi-CS.exe"

[Run]
Filename: "{app}\MeuJudi-CS.exe"; Description: "Abrir MeuJudi CS"; Flags: nowait postinstall skipifsilent
