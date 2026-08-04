/**
 * MeuJudi Sync — concorrência do PDPJ auto-ajustada por máquina.
 *
 * `SOURCE_CONCURRENCY.pdpj` (sync-worker.ts) e `MAX_QUERY_WINDOWS`
 * (pdpj-auth.ts) eram constantes fixas — cada degrau de teste exigia
 * recompilar e publicar uma versão nova do CS. Depois virou um número
 * editável num arquivo de config local. Agora (docs/roadmap/
 * 26-pdpj-concorrencia-inteligente.md, Parte A) o próprio PC calcula quantas
 * janelas PDPJ consegue abrir, olhando RAM livre e núcleos de CPU — o
 * arquivo de config deixa de ser "o valor usado" e vira um **teto manual
 * opcional**, pra quando o Caio quiser travar um limite mais baixo na mão
 * (ex.: testando concorrência mais alta com segurança).
 *
 * Trava de segurança: um único HTTP 429 (rate limit explícito do PDPJ)
 * força a concorrência de volta pra 1 por `COOLDOWN_MS`, ignorando o
 * cálculo automático e o teto manual, e avisa via notificação — não fica
 * testando mais alto sozinho depois de um sinal de alerta real.
 */

import { app, Notification } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logger, recordDiagnosticEvent } from './logger';
import { APP_NAME } from '../shared/constants';
import type { PdpjConcurrencyStatus } from '../shared/types';

const CONFIG_FILE_NAME = 'pdpj-test-config.json';
const MAX_CONCURRENCY_PERMITIDA = 10; // teto de sanidade — nunca ultrapassa isso, nem o calculo nem o teto manual
const COOLDOWN_MS = 30 * 60_000; // 30min voltando pra 1 depois de um 429 real

// Orçamento de RAM por janela PDPJ — estimativa inicial (janela Chromium
// oculta real, ver pdpj-auth.ts:1602). A validar com medição real do
// Gerenciador de Tarefas (ver "perguntas em aberto" do doc da Parte A) antes
// de considerar definitivo; fácil de ajustar num só lugar se a estimativa
// se mostrar errada na prática.
const RAM_ESTIMADA_POR_JANELA_MB = 350;
const RAM_MINIMA_LIVRE_RESERVADA_MB = 1024; // nunca conta a última faixa de RAM livre — deixa folga pro resto do PC

let ultimoAviso429: number | null = null;

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/** Teto manual opcional gravado pelo Caio na UI de Diagnóstico — null se nunca configurado (usa só o cálculo automático). */
function lerTetoManual(): number | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { maxConcurrentPdpj?: number };
    const valor = Number(parsed.maxConcurrentPdpj);
    if (Number.isFinite(valor) && valor >= 1) return Math.min(MAX_CONCURRENCY_PERMITIDA, Math.floor(valor));
  } catch {
    // arquivo nao existe ou invalido — sem teto manual, so usa o calculo.
  }
  return null;
}

/** Limite por RAM livre — quantas janelas cabem no orçamento estimado, com uma reserva mínima intocada pro resto do PC. */
function limitePorRam(): number {
  const livreMb = os.freemem() / (1024 * 1024);
  const disponivelParaJanelas = livreMb - RAM_MINIMA_LIVRE_RESERVADA_MB;
  if (disponivelParaJanelas <= 0) return 1;
  return Math.max(1, Math.floor(disponivelParaJanelas / RAM_ESTIMADA_POR_JANELA_MB));
}

/** Limite por CPU — deixa pelo menos 1 núcleo de folga pro resto do que o usuário estiver rodando. */
function limitePorCpu(): number {
  const cores = os.cpus().length || 1;
  return Math.max(1, cores - 1);
}

/** Cálculo automático (RAM + CPU), sem considerar cooldown nem teto manual — usado pra exibir o "porquê" na UI. */
function calcularConcorrenciaAutomatica(): { ram: number; cpu: number; resultado: number } {
  const ram = limitePorRam();
  const cpu = limitePorCpu();
  return { ram, cpu, resultado: Math.min(MAX_CONCURRENCY_PERMITIDA, ram, cpu) };
}

function emCooldown(): boolean {
  return ultimoAviso429 !== null && Date.now() - ultimoAviso429 < COOLDOWN_MS;
}

/** Concorrência efetiva agora — cálculo automático, limitado pelo teto manual se existir, exceto durante o cooldown pós-429 (força 1). */
export function getMaxConcurrentPdpj(): number {
  if (emCooldown()) return 1;
  const { resultado } = calcularConcorrenciaAutomatica();
  const teto = lerTetoManual();
  return teto !== null ? Math.min(resultado, teto) : resultado;
}

/** Estado completo pra exibir na UI (tela de Diagnóstico) — inclui o detalhamento do cálculo automático. */
export function getConcurrencyStatus(): PdpjConcurrencyStatus {
  const automatico = calcularConcorrenciaAutomatica();
  const tetoManual = lerTetoManual();
  const cooldown = emCooldown();
  const efetivo = cooldown ? 1 : tetoManual !== null ? Math.min(automatico.resultado, tetoManual) : automatico.resultado;
  return {
    automatico: automatico.resultado,
    limiteRam: automatico.ram,
    limiteCpu: automatico.cpu,
    tetoManual,
    efetivo,
    emCooldown: cooldown,
    cooldownAteMs: cooldown && ultimoAviso429 !== null ? ultimoAviso429 + COOLDOWN_MS : null,
  };
}

/** Grava o teto manual no arquivo de config — chamado pela UI de Diagnóstico, não precisa reiniciar o app. `null` remove o teto (volta a usar só o cálculo automático). */
export function setMaxConcurrentPdpj(valor: number | null): PdpjConcurrencyStatus {
  if (valor === null) {
    try {
      fs.rmSync(configPath(), { force: true });
    } catch {
      // sem arquivo pra remover, tudo bem
    }
    logger.info('PDPJ: teto manual de concorrencia removido — volta a usar so o calculo automatico');
    return getConcurrencyStatus();
  }
  const limpo = Math.max(1, Math.min(MAX_CONCURRENCY_PERMITIDA, Math.floor(valor) || 1));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ maxConcurrentPdpj: limpo }, null, 2), 'utf-8');
  logger.info('PDPJ: teto manual de concorrencia alterado pela UI de Diagnostico', { novoValor: limpo });
  return getConcurrencyStatus();
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
    automaticoAntesDoCooldown: calcularConcorrenciaAutomatica().resultado,
    tetoManual: lerTetoManual(),
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
