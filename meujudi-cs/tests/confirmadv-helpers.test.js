/**
 * Testes unitários para os helpers do ConfirmADV.
 *
 * Roda com `node tests/confirmadv-helpers.test.js`. Sem dependências
 * externas — só precisa do Node 18+.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// O módulo está em TypeScript. Compilamos na hora via tsc para um
// arquivo JS temporário com a mesma estrutura de import.
// Roda em ~1s — não é uma dependência em tempo de execução.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meujudi-cs-test-'));

try {
  // Compila para uma pasta temporária preservando a estrutura.
  const srcFile = path.join(ROOT, 'src/main/confirmadv-helpers.ts');
  execSync(
    `npx tsc "${srcFile}" --outDir "${tmpDir}" --module commonjs --target es2020 --skipLibCheck --rootDir "${ROOT}/src"`,
    { cwd: ROOT, stdio: 'pipe' }
  );
} catch (err) {
  console.error('Falha ao transpilar confirmadv-helpers.ts:');
  console.error(err.stdout ? err.stdout.toString() : '');
  console.error(err.message || err);
  process.exit(1);
}

const compiled = require(path.join(tmpDir, 'main/confirmadv-helpers.js'));
const { inferEventFromUrl, extractRequestIdFromUrl, CONFIRMADV_BASE } = compiled;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2705 ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err.message });
    console.log(`  \u274c ${name}`);
    console.log(`     ${err.message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'} - esperado: ${JSON.stringify(expected)}, recebido: ${JSON.stringify(actual)}`);
  }
}

function assertNull(actual, message) {
  if (actual !== null && actual !== undefined) {
    throw new Error(`${message || 'assertNull'} - esperado null/undefined, recebido: ${JSON.stringify(actual)}`);
  }
}

console.log('========================================');
console.log('MeuJudi CS — Testes ConfirmADV helpers');
console.log('========================================\n');

console.log('inferEventFromUrl:');

// Fora do domínio → null
test('URL externa devolve null', () => {
  assertNull(inferEventFromUrl('https://example.com/qualquer'), 'fora do dominio');
});

test('URL vazia devolve null', () => {
  assertNull(inferEventFromUrl(''), 'vazia');
});

// Raiz → null (página inicial, sem evento)
test('Raiz do ConfirmADV devolve null', () => {
  assertNull(inferEventFromUrl(`${CONFIRMADV_BASE}/`), 'raiz');
});

test('Raiz sem barra devolve null', () => {
  assertNull(inferEventFromUrl(CONFIRMADV_BASE), 'raiz sem barra');
});

// request_created
test('URL /confirm mapeia para request_created', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/confirm/abc`), 'request_created');
});

test('URL /solicitacao mapeia para request_created', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/solicitacao/123`), 'request_created');
});

// code_pending
test('URL /verification mapeia para code_pending', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/verification/abc-123`), 'code_pending');
});

test('URL /codigo mapeia para code_pending', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/codigo/abc`), 'code_pending');
});

test('URL /code mapeia para code_pending', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/code/abc`), 'code_pending');
});

// verified
test('URL /success mapeia para verified', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/success/abc`), 'verified');
});

test('URL /aprovado mapeia para verified', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/aprovado/abc`), 'verified');
});

test('URL /validado mapeia para verified', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/validado/abc`), 'verified');
});

// rejected
test('URL /error mapeia para rejected', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/error/abc`), 'rejected');
});

test('URL /recusado mapeia para rejected', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/recusado/abc`), 'rejected');
});

test('URL /invalid mapeia para rejected', () => {
  assertEqual(inferEventFromUrl(`${CONFIRMADV_BASE}/invalid/abc`), 'rejected');
});

// Sem pattern reconhecido → null
test('URL sem pattern reconhecido devolve null', () => {
  assertNull(inferEventFromUrl(`${CONFIRMADV_BASE}/dashboard`), 'dashboard');
});

test('URL com path / sobre devolve null', () => {
  assertNull(inferEventFromUrl(`${CONFIRMADV_BASE}/sobre`), 'sobre');
});

console.log('\nextractRequestIdFromUrl:');

test('Extrai ID de /verification/abc123', () => {
  assertEqual(extractRequestIdFromUrl(`${CONFIRMADV_BASE}/verification/abc123`), 'abc123');
});

test('Extrai ID com hífen de /verification/abc-123', () => {
  assertEqual(extractRequestIdFromUrl(`${CONFIRMADV_BASE}/verification/abc-123`), 'abc-123');
});

test('Não extrai ID muito curto (< 6 chars)', () => {
  assertEqual(extractRequestIdFromUrl(`${CONFIRMADV_BASE}/verification/abc`), undefined);
});

test('Não extrai de path vazio', () => {
  assertEqual(extractRequestIdFromUrl(`${CONFIRMADV_BASE}/`), undefined);
});

test('Devolve undefined para URL inválida', () => {
  assertEqual(extractRequestIdFromUrl('nao-eh-url'), undefined);
});

test('Devolve undefined para URL vazia', () => {
  assertEqual(extractRequestIdFromUrl(''), undefined);
});

console.log('\n========================================');
console.log('Resultado');
console.log('========================================\n');
console.log(`\u2705 Passou: ${passed}`);
console.log(`\u274c Falhou: ${failed}`);
console.log(`\ud83d\udcca Total:  ${passed + failed} testes\n`);

fs.rmSync(tmpDir, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);

if (failed > 0) {
  console.log('Falhas:');
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.message}`));
  process.exit(1);
}

console.log('\u2705 Todos os testes passaram.');
process.exit(0);
