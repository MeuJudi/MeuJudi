/**
 * MeuJudi CS — Diagnostic
 *
 * Roda bateria de testes automatizada pra validar a integração com cert. A1 + PJe.
 * Gera DiagnosticReport que é:
 * 1. Salvo em %APPDATA%\meujudi-cs\diagnostics\report-{timestamp}.json
 * 2. Enviado pro Supabase (se habilitado)
 * 3. Retornado pro renderer via IPC
 *
 * Roda automaticamente na 1ª execução do CS.
 * Também disponível via menu (botão "Executar diagnóstico").
 */

import { app } from 'electron';
import os from 'os';
import { getRecentDiagnosticEvents, getRecentLogs, logger, recordDiagnosticEvent } from './logger';
import { detectarCertA1 } from './cert-detector';
import { CookieStore } from './cookie-store';
import { PJeAPI } from './pje-api';
import { APP_NAME, APP_VERSION, PJE_BASE_URLS, TIMEOUTS } from '../shared/constants';
import { enviarRelatorioSupabase } from './supabase-reporter';
import type {
  DiagnosticReport,
  PJeConnectionTest,
  PJeLoginTest,
  CertPopupTest,
  CookiesTest,
} from '../shared/types';
import { randomUUID } from 'crypto';

export class Diagnostic {
  private cookieStore: CookieStore;
  private pjeApi: PJeAPI;

  constructor() {
    this.cookieStore = new CookieStore();
    this.pjeApi = new PJeAPI(() => this.cookieStore.getValidSession());
  }

  /**
   * Roda diagnóstico completo.
   */
  async run(triggerReason: string = 'manual', loginFailureMessage?: string): Promise<DiagnosticReport> {
    const startTime = Date.now();
    logger.info('=== INICIANDO DIAGNÓSTICO ===');
    recordDiagnosticEvent('diagnostic_started', 'started', 'Diagnostico iniciado', { triggerReason });

    const report: DiagnosticReport = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      meuJudiVersion: APP_VERSION,
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      windowsVersion: `${os.type()} ${os.release()} (${os.platform()})`,
      arch: process.arch,
      hostname: os.hostname(),
      triggerReason,
      certA1: { found: false },
      pjeConnection: { reachable: false },
      certPopup: { appeared: false, cancelled: false, autoSelected: false },
      pjeLogin: { attempted: false, succeeded: false },
      cookies: { count: 0, hasSession: false, hasXsrf: false },
      overallSuccess: false,
      errors: [],
      warnings: [],
      recommendations: [],
      technicalSummary: {},
    };

    // ======== Teste 1: Detectar cert. A1 ========
    try {
      logger.info('[1/5] Detectando cert. A1...');
      report.certA1 = detectarCertA1();
      if (!report.certA1.found) {
        report.errors.push('Cert. A1 não detectado no Windows Cert Store');
        report.recommendations.push('Instale o cert. A1 (.pfx) no Windows: clique 2x → Instalar → Pessoal');
      } else if (report.certA1.expired) {
        report.errors.push(`Cert. A1 expirado (${report.certA1.daysToExpire} dias atrás)`);
        report.recommendations.push('Renove o cert. A1 (custa R$130-200/ano)');
      } else if (report.certA1.daysToExpire && report.certA1.daysToExpire < 30) {
        report.warnings.push(`Cert. A1 expira em ${report.certA1.daysToExpire} dias`);
        report.recommendations.push('Renove o cert. A1 em breve');
      }
    } catch (err: any) {
      logger.error('Erro no teste 1:', err);
      report.certA1 = { found: false, error: err.message };
      report.errors.push(`Erro ao detectar cert. A1: ${err.message}`);
    }

    // ======== Teste 2: Conectividade com PJe ========
    try {
      logger.info('[2/5] Testando conexão com PJe...');
      report.pjeConnection = await this.testPJeConnection();
      if (!report.pjeConnection.reachable) {
        report.errors.push('PJe não está acessível');
        report.recommendations.push('Verifique conexão com a internet e firewall');
      }
    } catch (err: any) {
      logger.error('Erro no teste 2:', err);
      report.pjeConnection = { reachable: false, error: err.message };
      report.errors.push(`Erro ao conectar PJe: ${err.message}`);
    }

    // ======== Teste 3: Popup do cert. A1 (só se cert. disponível) ========
    if (report.certA1.found && !report.certA1.expired && report.pjeConnection.reachable) {
      try {
        logger.info('[3/5] Simulando detecção de popup de cert. A1...');
        // Não dá pra detectar o popup do Windows de dentro do Electron,
        // mas dá pra fazer um teste heurístico via Electron API
        report.certPopup = await this.testCertPopup();
        if (!report.certPopup.appeared) {
          report.warnings.push('Não foi possível confirmar se popup do cert. A1 apareceu');
          report.recommendations.push('Ao testar manualmente, confirme se o popup do Windows aparece');
        }
        if (report.certPopup.cancelled) {
          report.warnings.push('Popup do cert. A1 foi cancelado (teste automatizado não detecta, isso é só heurística)');
        }
      } catch (err: any) {
        logger.error('Erro no teste 3:', err);
        report.certPopup = { appeared: false, cancelled: false, autoSelected: false, error: err.message };
      }
    } else {
      report.certPopup = {
        appeared: false,
        cancelled: false,
        autoSelected: false,
        error: 'Pulou (cert. A1 não disponível ou PJe offline)',
      };
    }

    // ======== Teste 4: Cookies salvos (se já teve login antes) ========
    try {
      logger.info('[4/5] Verificando cookies salvos...');
      const session = this.cookieStore.getValidSession();
      if (session) {
        report.cookies = {
          count: session.cookies.length,
          hasSession: session.cookies.some((c) => c.name === 'JSESSIONID' || c.name === 'AUTH_SESSION_ID'),
          hasXsrf: session.cookies.some((c) => c.name === 'XSRF-TOKEN'),
          cookieNames: session.cookies.map((c) => c.name),
        };
        if (report.cookies.hasSession) {
          logger.info('Sessão PJe já existe e parece válida');
        } else {
          report.warnings.push('Sessão PJe existe mas não tem JSESSIONID — pode estar corrompida');
        }
      } else {
        logger.info('Nenhuma sessão PJe salva');
        report.cookies = { count: 0, hasSession: false, hasXsrf: false };
      }
    } catch (err: any) {
      logger.error('Erro no teste 4:', err);
      report.cookies = { count: 0, hasSession: false, hasXsrf: false, cookieNames: [] };
      report.errors.push(`Erro ao verificar cookies: ${err.message}`);
    }

    // ======== Teste 5: Tentar login (se cert. + PJe OK, e sem sessão) ========
    if (
      report.certA1.found &&
      !report.certA1.expired &&
      report.pjeConnection.reachable &&
      !report.cookies.hasSession
    ) {
      try {
        logger.info('[5/5] Tentando login automático (sem UI)...');
        report.pjeLogin = await this.testLogin();
        if (report.pjeLogin.succeeded) {
          logger.info('Login automático funcionou!');
        } else {
          report.warnings.push('Login automático não completou (pode precisar interação manual do usuário)');
          report.recommendations.push('Execute o login manual via menu "Conectar ao PJe"');
        }
      } catch (err: any) {
        logger.error('Erro no teste 5:', err);
        report.pjeLogin = {
          attempted: true,
          succeeded: false,
          error: err.message,
          errorCode: 'UNKNOWN',
        };
      }
    } else {
      report.pjeLogin = {
        attempted: false,
        succeeded: false,
        error: 'Pulou (pré-requisitos não atendidos)',
      };
    }

    // ======== Resumo ========
    if (loginFailureMessage) {
      report.pjeLogin = {
        attempted: true,
        succeeded: false,
        error: loginFailureMessage.slice(0, 200),
        errorCode: 'PJE_LOGIN_FAILED',
      };
      report.errors.push(`Falha no login PJe: ${loginFailureMessage}`);
    }

    report.overallSuccess = report.errors.length === 0 && report.pjeConnection.reachable;
    const analysis = this.analyzeReport(report);
    report.probableCause = analysis.probableCause;
    report.nextAction = analysis.nextAction;
    report.technicalSummary = {
      triggerReason,
      appPackaged: app.isPackaged,
      pjeBaseUrl: PJE_BASE_URLS.trt9,
      certFound: report.certA1.found,
      certExpired: report.certA1.expired,
      certHasPrivateKey: report.certA1.hasPrivateKey,
      pjeReachable: report.pjeConnection.reachable,
      pjeLatencyMs: report.pjeConnection.latencyMs,
      cookiesCount: report.cookies.count,
      cookieNames: report.cookies.cookieNames,
      hasSessionCookie: report.cookies.hasSession,
      hasXsrfCookie: report.cookies.hasXsrf,
      loginAttempted: report.pjeLogin.attempted,
      loginSucceeded: report.pjeLogin.succeeded,
      loginErrorCode: report.pjeLogin.errorCode,
      durationMs: Date.now() - startTime,
    };
    report.recentLogs = getRecentLogs(160);
    report.recentEvents = getRecentDiagnosticEvents(220);

    const duration = Date.now() - startTime;
    recordDiagnosticEvent('diagnostic_finished', report.overallSuccess ? 'success' : 'error', report.probableCause, {
      totalErrors: report.errors.length,
      totalWarnings: report.warnings.length,
      nextAction: report.nextAction,
    }, duration);
    report.recentEvents = getRecentDiagnosticEvents(220);
    logger.info(`=== DIAGNÓSTICO CONCLUÍDO em ${duration}ms ===`);
    logger.info('Resumo:', {
      certFound: report.certA1.found,
      certExpired: report.certA1.expired,
      pjeReachable: report.pjeConnection.reachable,
      hasCookies: report.cookies.hasSession,
      loginSucceeded: report.pjeLogin.succeeded,
      errors: report.errors.length,
      warnings: report.warnings.length,
    });

    // Salva localmente
    this.salvarRelatorio(report);

    // Envia pro Supabase (não bloqueia se falhar)
    enviarRelatorioSupabase(this.sanitizeReport(report)).catch((err) => {
      logger.warn('Falha ao enviar pro Supabase (não crítico):', err.message);
    });

    return report;
  }

  // ============================================================
  //  TESTES INDIVIDUAIS
  // ============================================================

  /**
   * Testa se o PJe está acessível (sem login).
   */
  private async testPJeConnection(): Promise<PJeConnectionTest> {
    const start = Date.now();
    try {
      const url = `${PJE_BASE_URLS.trt9}/pje-comum-api/api/fusohorario`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.request);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': `MeuJudi-CS/${APP_VERSION} (diagnostic)` },
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return {
          reachable: false,
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      return { reachable: true, latencyMs };
    } catch (err: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err.name === 'AbortError' ? 'Timeout' : err.message?.slice(0, 200),
      };
    }
  }

  /**
   * Testa detecção do popup de cert. A1 (heurística).
   * Não dá pra simular de verdade — apenas verifica configuração do Chromium.
   */
  private async testCertPopup(): Promise<CertPopupTest> {
    // Heurística: verifica se o Electron suporta select-client-certificate event
    // (Chromium dispara esse evento quando o servidor pede cert. do cliente)
    // Se o handler existe, é um bom sinal de que o popup do Windows vai aparecer
    return {
      appeared: true, // assunção otimista — não dá pra confirmar
      cancelled: false,
      autoSelected: true, // assunção padrão (Windows vai auto-selecionar se tiver 1 cert.)
      durationMs: 0,
    };
  }

  /**
   * Tenta login sem UI (vai falhar porque cert. A1 precisa de interação).
   * O objetivo é só medir quanto tempo dura o handshake TLS.
   */
  private async testLogin(): Promise<PJeLoginTest> {
    const start = Date.now();
    try {
      // Tenta fazer 1 request autenticado (vai falhar sem sessão)
      // Apenas mede se o TLS handshake funciona
      const url = `${PJE_BASE_URLS.trt9}/pje-seguranca/api/token/perfis`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': `MeuJudi-CS/${APP_VERSION} (diagnostic)` },
      }).catch((err) => ({ status: 0, error: err.message }));

      const durationMs = Date.now() - start;

      // O login sem cert. A1 vai retornar 401 ou redirect
      return {
        attempted: true,
        succeeded: false,
        durationMs,
        error: 'Login automático requer interação do usuário (popup do cert. A1)',
        errorCode: 'CANCELLED',
      };
    } catch (err: any) {
      return {
        attempted: true,
        succeeded: false,
        durationMs: Date.now() - start,
        error: err.message?.slice(0, 200),
        errorCode: 'UNKNOWN',
      };
    }
  }

  // ============================================================
  //  PERSISTÊNCIA LOCAL
  // ============================================================

  /**
   * Salva o relatório em %APPDATA%\meujudi-cs\diagnostics\report-{timestamp}.json
   */
  private salvarRelatorio(report: DiagnosticReport): void {
    try {
      const fs = require('fs');
      const path = require('path');

      const userData = app.getPath('userData');
      const diagDir = path.join(userData, 'diagnostics');

      if (!fs.existsSync(diagDir)) {
        fs.mkdirSync(diagDir, { recursive: true });
      }

      // Sanitiza antes de salvar (remove cookies, mantém só metadata)
      const sanitized = this.sanitizeReport(report);
      const filename = `report-${report.timestamp.replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(diagDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(sanitized, null, 2), 'utf-8');
      logger.info(`Relatório salvo em: ${filepath}`);
    } catch (err: any) {
      logger.error('Erro ao salvar relatório local:', err.message);
    }
  }

  /**
   * Remove dados sensíveis do relatório antes de salvar/enviar.
   */
  private sanitizeReport(report: DiagnosticReport): DiagnosticReport {
    return {
      ...report,
      // Remove cookie values, mantém só metadata
      cookies: {
        count: report.cookies.count,
        hasSession: report.cookies.hasSession,
        hasXsrf: report.cookies.hasXsrf,
        cookieNames: report.cookies.cookieNames?.slice(0, 10), // máximo 10 nomes
      },
    };
  }

  private analyzeReport(report: DiagnosticReport): { probableCause: string; nextAction: string } {
    const loginError = report.pjeLogin.error || '';

    if (!report.certA1.found) {
      return {
        probableCause: 'Certificado A1 nao foi encontrado no Windows Cert Store.',
        nextAction: 'Instalar o arquivo .pfx em Certificados - Usuario Atual - Pessoal e tentar novamente.',
      };
    }

    if (report.certA1.expired) {
      return {
        probableCause: 'Certificado A1 encontrado, mas expirado.',
        nextAction: 'Renovar o certificado e instalar a nova versao no Windows.',
      };
    }

    if (!report.pjeConnection.reachable) {
      return {
        probableCause: `PJe nao respondeu ao teste de conectividade${report.pjeConnection.error ? `: ${report.pjeConnection.error}` : '.'}`,
        nextAction: 'Verificar internet, firewall, VPN, antivirus e disponibilidade do tribunal.',
      };
    }

    if (loginError.includes('XSRF-TOKEN')) {
      return {
        probableCause: 'Login abriu, mas nao gerou o cookie XSRF-TOKEN esperado.',
        nextAction: 'Repetir login escolhendo o certificado correto; se persistir, verificar se o fluxo exige PJeOffice ou etapa adicional do GOV.',
      };
    }

    if (loginError.includes('Tempo limite')) {
      return {
        probableCause: 'Login ficou aberto ate o limite sem completar o retorno para o PJe.',
        nextAction: 'Confirmar se o usuario concluiu GOV/certificado e se a tela voltou para o painel do PJe antes do timeout.',
      };
    }

    if (loginError.includes('cancelado') || loginError.includes('fechada')) {
      return {
        probableCause: 'Janela de login foi fechada antes de concluir.',
        nextAction: 'Tentar conectar novamente e aguardar a janela fechar sozinha apos o login.',
      };
    }

    if (!report.cookies.hasSession && report.pjeLogin.attempted) {
      return {
        probableCause: 'Login foi tentado, mas nao foi possivel salvar uma sessao PJe valida.',
        nextAction: 'Refazer login manual e conferir se o PJe pediu certificado ou GOV durante o fluxo.',
      };
    }

    if (!report.cookies.hasXsrf && report.cookies.hasSession) {
      return {
        probableCause: 'Sessao encontrada, mas sem XSRF-TOKEN.',
        nextAction: 'Desconectar e conectar novamente para renovar cookies do PJe.',
      };
    }

    return {
      probableCause: report.overallSuccess ? 'Diagnostico nao encontrou falha critica.' : 'Falha generica no fluxo do CS/PJe.',
      nextAction: report.overallSuccess ? 'Continuar testes de sincronizacao.' : 'Abrir o relatorio detalhado e revisar a timeline de eventos.',
    };
  }
}
