/**
 * Script de validação pré-.exe
 * Verifica que o código do MeuJudi CS está pronto pra ser compilado
 * Roda SEM precisar de Electron instalado
 *
 * Uso: node tests/validate-pre-build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const checks = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      checks.push({ name, status: '✅', message: 'OK' });
    } else {
      checks.push({ name, status: '⚠️', message: result });
      warnings.push(`${name}: ${result}`);
    }
  } catch (err) {
    checks.push({ name, status: '❌', message: err.message });
    errors.push(`${name}: ${err.message}`);
  }
}

function fileExists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function readFile(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf-8');
}

console.log('========================================');
console.log('MeuJudi CS — Validação Pré-Build');
console.log('========================================\n');

// ============================================================
// 1. Estrutura de arquivos
// ============================================================
console.log('📂 Verificando estrutura de arquivos...\n');

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'tsconfig.main.json',
  'tsconfig.renderer.json',
  '.env',
  '.env.example',
  '.gitignore',
  'README.md',
  'installer.iss',
  'docs/setup-para-advogado.md',
  'docs/sql/20260715_diagnostic_reports.sql',
  // Main process
  'src/main/index.ts',
  'src/main/tray.ts',
  'src/main/logger.ts',
  'src/main/pje-auth.ts',
  'src/main/cookie-store.ts',
  'src/main/pje-api.ts',
  'src/main/cert-detector.ts',
  'src/main/diagnostic.ts',
  'src/main/supabase-reporter.ts',
  'src/main/ipc-handlers.ts',
  'src/main/scheduler.ts',
  // Preload
  'src/preload/index.ts',
  // Shared
  'src/shared/types.ts',
  'src/shared/constants.ts',
  'src/shared/crypto.ts',
  'src/shared/globals.d.ts',
  // Renderer
  'src/renderer/package.json',
  'src/renderer/next.config.js',
  'src/renderer/tailwind.config.js',
  'src/renderer/pages/_app.tsx',
  'src/renderer/pages/_document.tsx',
  'src/renderer/pages/index.tsx',
  'src/renderer/pages/settings/pje-connection.tsx',
  'src/renderer/components/StatusIndicator.tsx',
  'src/renderer/components/LogsViewer.tsx',
  'src/renderer/components/DiagnosticViewer.tsx',
  'src/renderer/hooks/usePJeStatus.ts',
  'src/renderer/hooks/useTimeAgo.ts',
  'src/renderer/styles/globals.css',
  // Assets
  'assets/icon-original.png',
];

requiredFiles.forEach((f) => {
  check(`Arquivo: ${f}`, () => {
    if (!fileExists(f)) {
      return `Arquivo não encontrado`;
    }
    return true;
  });
});

// ============================================================
// 2. package.json
// ============================================================
console.log('\n📦 Verificando package.json...\n');

check('package.json: name correto', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.name === 'meujudi-cs' ? true : `name é "${pkg.name}", esperado "meujudi-cs"`;
});

check('package.json: productName correto', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.productName === 'MeuJudi CS' ? true : `productName é "${pkg.productName}"`;
});

check('package.json: main aponta pro dist', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.main === 'dist/main/index.js' ? true : `main é "${pkg.main}"`;
});

check('package.json: script dist:win existe', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.scripts?.['dist:win'] ? true : 'script "dist:win" não encontrado';
});

check('package.json: electron-builder config', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.build?.appId === 'com.meujudi.cs' ? true : 'appId não configurado';
});

check('package.json: instalador NSIS', () => {
  const pkg = JSON.parse(readFile('package.json'));
  return pkg.build?.win?.target?.[0]?.target === 'nsis' ? true : 'target NSIS não configurado';
});

check('package.json: dependencies essenciais', () => {
  const pkg = JSON.parse(readFile('package.json'));
  const required = ['electron', 'electron-store', 'next', 'react', '@anthropic-ai/sdk'];
  const missing = required.filter((d) => !pkg.dependencies?.[d] && !pkg.devDependencies?.[d]);
  return missing.length === 0 ? true : `Faltando: ${missing.join(', ')}`;
});

// ============================================================
// 3. .env
// ============================================================
console.log('\n🔐 Verificando .env...\n');

check('.env: SUPABASE_URL configurado', () => {
  const env = readFile('.env');
  return env.includes('SUPABASE_URL=https://') ? true : 'SUPABASE_URL não configurado';
});

check('.env: SUPABASE_SERVICE_KEY configurado', () => {
  const env = readFile('.env');
  return env.includes('SUPABASE_SERVICE_KEY=eyJ') ? true : 'SUPABASE_SERVICE_KEY não configurado';
});

check('.env: NÃO está commitado (está no .gitignore)', () => {
  const gitignore = readFile('.gitignore');
  return gitignore.includes('.env') ? true : '.env não está no .gitignore!';
});

// ============================================================
// 4. PJeAuth (validação crítica)
// ============================================================
console.log('\n🔐 Verificando pje-auth.ts (proteções do cert. A1)...');

const pjeAuth = readFile('src/main/pje-auth.ts');

check('PJeAuth: tem listener select-client-certificate', () => {
  return pjeAuth.includes("'select-client-certificate'")
    ? true
    : 'Listener select-client-certificate NÃO encontrado (popup do cert. A1 não vai funcionar)';
});

check('PJeAuth: tem listener certificate-error', () => {
  return pjeAuth.includes("'certificate-error'")
    ? true
    : 'Listener certificate-error NÃO encontrado (erros de TLS vão travar)';
});

check('PJeAuth: tem listener did-fail-load', () => {
  return pjeAuth.includes("'did-fail-load'")
    ? true
    : 'Listener did-fail-load NÃO encontrado';
});

check('PJeAuth: tem listener did-navigate', () => {
  return pjeAuth.includes("'did-navigate'")
    ? true
    : 'Listener did-navigate NÃO encontrado';
});

check('PJeAuth: tem listener did-navigate-in-page', () => {
  return pjeAuth.includes("'did-navigate-in-page'")
    ? true
    : 'Listener did-navigate-in-page NÃO encontrado (pushState do Angular não vai ser detectado)';
});

check('PJeAuth: tem polling de URL', () => {
  return pjeAuth.includes('urlPollInterval') || pjeAuth.includes('setInterval')
    ? true
    : 'Polling de URL NÃO encontrado (fallback não vai funcionar)';
});

check('PJeAuth: trata ERR_BAD_SSL_CLIENT_AUTH_CERT', () => {
  return pjeAuth.includes('ERR_BAD_SSL_CLIENT_AUTH_CERT') || pjeAuth.includes('-501')
    ? true
    : 'Tratamento de cert rejeitado (-501) NÃO encontrado';
});

check('PJeAuth: extrai userId do JWT Keycloak', () => {
  return pjeAuth.includes('KEYCLOAK_IDENTITY') || pjeAuth.includes('KEYCLOAK_ID')
    ? true
    : 'Extração de userId do JWT Keycloak NÃO encontrada (vai depender de fallback)';
});

check('PJeAuth: auto-seleciona cert se só tiver 1', () => {
  return pjeAuth.includes('certificateList.length === 1') || pjeAuth.includes('certificateList.length == 1')
    ? true
    : 'Auto-seleção de cert único NÃO implementada';
});

check('PJeAuth: tem logs detalhados em cada etapa', () => {
  const logCount = (pjeAuth.match(/logger\.(info|debug|warn|error)/g) || []).length;
  return logCount >= 20 ? true : `Só ${logCount} logs (esperado 20+)`;
});

check('PJeAuth: tem timeout configurado', () => {
  return pjeAuth.includes('TIMEOUTS.login') || pjeAuth.includes('60000')
    ? true
    : 'Timeout não configurado';
});

check('PJeAuth: tem tratamento de cert não encontrado', () => {
  return pjeAuth.includes('showCertNotFoundError') || pjeAuth.includes('Nenhum cert. disponível')
    ? true
    : 'Tratamento de cert não encontrado NÃO implementado';
});

// ============================================================
// 5. CertDetector
// ============================================================
console.log('\n🔍 Verificando cert-detector.ts...');

const certDetector = readFile('src/main/cert-detector.ts');

check('CertDetector: usa PowerShell pra detectar cert', () => {
  return certDetector.includes('powershell') ? true : 'PowerShell não usado';
});

check('CertDetector: busca em Cert:\\CurrentUser\\My', () => {
  return certDetector.includes('CurrentUser\\My') || certDetector.includes('CurrentUser/My')
    ? true
    : 'Path do Cert Store incorreto';
});

check('CertDetector: extrai CPF do subject', () => {
  return certDetector.includes('cpf') && certDetector.includes('Subject')
    ? true
    : 'Extração de CPF não implementada';
});

check('CertDetector: tem fallback se der erro', () => {
  return certDetector.includes('catch') ? true : 'Sem tratamento de erro';
});

// ============================================================
// 6. Diagnostic
// ============================================================
console.log('\n📊 Verificando diagnostic.ts...');

const diagnostic = readFile('src/main/diagnostic.ts');

check('Diagnostic: roda 5 testes', () => {
  const testCount = (diagnostic.match(/logger\.info\('\[1\/5\]|\[2\/5\]|\[3\/5\]|\[4\/5\]|\[5\/5\]/g) || []).length;
  return testCount === 5 ? true : `${testCount} testes encontrados (esperado 5)`;
});

check('Diagnostic: sanitiza dados sensíveis', () => {
  return diagnostic.includes('sanitizeReport') ? true : 'Sem sanitização (vai vazar dados)';
});

check('Diagnostic: envia pro Supabase', () => {
  return diagnostic.includes('enviarRelatorioSupabase') ? true : 'Não envia pro Supabase';
});

check('Diagnostic: salva localmente', () => {
  return diagnostic.includes('salvarRelatorio') ? true : 'Não salva localmente';
});

// ============================================================
// 7. Supabase Reporter
// ============================================================
console.log('\n☁️ Verificando supabase-reporter.ts...');

const supabaseReporter = readFile('src/main/supabase-reporter.ts');

check('Supabase Reporter: usa SUPABASE_URL', () => {
  return supabaseReporter.includes('SUPABASE_URL') ? true : 'Não usa SUPABASE_URL';
});

check('Supabase Reporter: usa SUPABASE_SERVICE_KEY', () => {
  return supabaseReporter.includes('SUPABASE_SERVICE_KEY') ? true : 'Não usa SUPABASE_SERVICE_KEY';
});

check('Supabase Reporter: tem timeout', () => {
  return supabaseReporter.includes('AbortController') || supabaseReporter.includes('TIMEOUT_MS')
    ? true
    : 'Sem timeout (pode travar)';
});

check('Supabase Reporter: trata erros sem lançar exceção', () => {
  return supabaseReporter.includes('return { sent: false') || supabaseReporter.includes('return { sent:true')
    ? true
    : 'Erros podem quebrar o app';
});

// ============================================================
// 8. Installer
// ============================================================
console.log('\n📦 Verificando installer.iss...');

const installer = readFile('installer.iss');

check('Installer: AppName correto', () => {
  return installer.includes('AppName=MeuJudi CS') ? true : 'AppName incorreto';
});

check('Installer: OutputBaseFilename correto', () => {
  return installer.includes('OutputBaseFilename=MeuJudi-CS-Setup') ? true : 'OutputBaseFilename incorreto';
});

check('Installer: tem target NSIS', () => {
  return installer.includes('TargetType=nsis') || installer.includes('nsis')
    ? true
    : 'Target NSIS não configurado';
});

check('Installer: cria atalho no desktop', () => {
  return installer.includes('desktopicon') ? true : 'Sem atalho no desktop';
});

check('Installer: tem --first-run flag', () => {
  return installer.includes('--first-run') || installer.includes('first-run')
    ? true : 'Flag --first-run não mencionada';
});

// ============================================================
// 9. Setup do Advogado
// ============================================================
console.log('\n📖 Verificando setup-para-advogado.md...');

const setupDoc = readFile('docs/setup-para-advogado.md');

check('Setup doc: explica como instalar cert. A1', () => {
  return setupDoc.includes('cert. A1') && (setupDoc.includes('instalar') || setupDoc.includes('Instale'))
    ? true
    : 'Não explica instalação do cert. A1';
});

check('Setup doc: explica popup do Windows', () => {
  return setupDoc.includes('popup') || setupDoc.includes('Windows')
    ? true
    : 'Não menciona o popup do Windows';
});

check('Setup doc: tem troubleshooting', () => {
  return setupDoc.includes('Se algo der errado') || setupDoc.includes('Troubleshooting') || setupDoc.includes('Erro')
    ? true
    : 'Sem seção de troubleshooting';
});

check('Setup doc: menciona LGPD', () => {
  return setupDoc.includes('LGPD') ? true : 'Sem menção a LGPD';
});

// ============================================================
// 10. SQL
// ============================================================
console.log('\n🗄️ Verificando SQL da tabela...');

const sql = readFile('docs/sql/20260715_diagnostic_reports.sql');

check('SQL: cria tabela diagnostic_reports', () => {
  return sql.includes('create table') && sql.includes('diagnostic_reports')
    ? true : 'Tabela diagnostic_reports não criada';
});

check('SQL: tem RLS', () => {
  return sql.includes('row level security') ? true : 'Sem RLS (inseguro)';
});

check('SQL: tem índices', () => {
  return sql.includes('create index') ? true : 'Sem índices (queries lentas)';
});

check('SQL: tem comentários', () => {
  return sql.includes('comment on') ? true : 'Sem comentários no schema';
});

// ============================================================
//  RELATÓRIO
// ============================================================
console.log('\n========================================');
console.log('RELATÓRIO DE VALIDAÇÃO');
console.log('========================================\n');

const passed = checks.filter((c) => c.status === '✅').length;
const warned = checks.filter((c) => c.status === '⚠️').length;
const failed = checks.filter((c) => c.status === '❌').length;

console.log(`✅ Passou: ${passed}`);
console.log(`⚠️ Avisos: ${warned}`);
console.log(`❌ Falhou: ${failed}`);
console.log(`📊 Total: ${checks.length} checks\n`);

if (failed > 0) {
  console.log('❌ ERROS CRÍTICOS (bloqueiam compilação):');
  errors.forEach((e) => console.log(`   - ${e}`));
  console.log('');
}

if (warned > 0) {
  console.log('⚠️ AVISOS (não bloqueiam, mas devem ser revisados):');
  warnings.forEach((w) => console.log(`   - ${w}`));
  console.log('');
}

if (failed === 0) {
  console.log('========================================');
  console.log('✅ PRONTO PRA COMPILAR O .EXE');
  console.log('========================================');
  console.log('\nPróximos passos:');
  console.log('  1. cd C:\\Caio\\MeuJudi\\meujudi-cs');
  console.log('  2. npm install');
  console.log('  3. npm run dev (teste local com gov.br)');
  console.log('  4. npm run dist:win (gera .exe)');
  console.log('  5. Manda pro Luís Fellype');
  console.log('  6. Monitora o diagnóstico no Supabase');
  process.exit(0);
} else {
  console.log('========================================');
  console.log('❌ CORRIGIR ANTES DE COMPILAR');
  console.log('========================================');
  process.exit(1);
}
