/**
 * MeuJudi Sync — CertDetector
 *
 * Detecta cert. A1 (e-CPF) e A3 (token/smart card) no Windows Cert Store.
 * Usa PowerShell pra A1 e certutil como fallback pra A3 (tokens com KSP/CNG).
 */

import { execSync } from 'child_process';
import { logger } from './logger';
import type { CertA1Info } from '../shared/types';

const POWERSHELL_TIMEOUT_MS = 10_000;
const CERTUTIL_TIMEOUT_MS = 10_000;

/**
 * Detecta cert. A1 e A3 no Windows Cert Store.
 * Estratégia:
 *  1. PowerShell Get-ChildItem (rápido, funciona bem pra A1)
 *  2. Se não achou → certutil -store (funciona pra A3 com KSP/CNG)
 * Retorna CertA1Info (found: false se não achou ou deu erro).
 */
export function detectarCertA1(): CertA1Info {
  const start = Date.now();
  try {
    logger.info('Detectando cert. A1/A3 no Windows Cert Store...');

    // Tentativa 1: PowerShell Get-ChildItem (funciona pra maioria dos A1)
    const psResult = detectarViaPowerShell();
    if (psResult.found) {
      logger.info(`Detectado via PowerShell em ${Date.now() - start}ms`);
      return psResult;
    }

    // Tentativa 2: certutil -store (funciona pra A3 com KSP/CNG)
    logger.info('PowerShell não encontrou, tentando via certutil...');
    const certutilResult = detectarViaCertutil();
    if (certutilResult.found) {
      logger.info(`Detectado via certutil em ${Date.now() - start}ms`);
      return certutilResult;
    }

    // Nenhum método encontrou
    logger.info('Nenhum cert. A1 ou A3 encontrado em nenhum método');
    return {
      found: false,
      error: psResult.error || certutilResult.error || 'Nenhum certificado com chave privada encontrado',
    };
  } catch (err: any) {
    logger.error('Erro ao detectar cert. A1/A3:', err.message);
    return {
      found: false,
      error: `Erro ao executar detecção: ${err.message?.slice(0, 200)}`,
    };
  } finally {
    logger.debug(`Detecção total levou ${Date.now() - start}ms`);
  }
}

/**
 * Detecta via PowerShell Get-ChildItem — funciona bem pra A1.
 * Para A3, o HasPrivateKey pode retornar false devido ao KSP/CNG.
 */
function detectarViaPowerShell(): CertA1Info {
  try {
    const psCommand = `
      $certs = @()
      $certs += Get-ChildItem -Path "Cert:\\CurrentUser\\My" -ErrorAction SilentlyContinue
      $certs += Get-ChildItem -Path "Cert:\\LocalMachine\\My" -ErrorAction SilentlyContinue
      $certs = $certs |
        Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
        Select-Object Subject, NotBefore, NotAfter, Thumbprint, Issuer, HasPrivateKey |
        Sort-Object Thumbprint -Unique
      $certs | ConvertTo-Json -Depth 2
    `;

    const output = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
    });

    logger.debug('Output PowerShell (raw):', output.slice(0, 500));

    if (!output || !output.trim() || output.trim() === 'null') {
      return { found: false, error: 'Nenhum cert. com private key encontrado via PowerShell' };
    }

    const parsed = JSON.parse(output);
    const certs = Array.isArray(parsed) ? parsed : [parsed];

    if (certs.length === 0) {
      return { found: false, error: 'Nenhum cert. com private key e não expirado encontrado via PowerShell' };
    }

    // Filtra cert. ICP-Brasil (A1 ou A3) — pega o primeiro com padrão de CPF
    const cert = certs.find((c: any) => /\d{11}/.test(c.Subject)) || certs[0];

    return buildResult(cert, 'A1');
  } catch (err: any) {
    logger.warn('PowerShell detection failed:', err.message?.slice(0, 200));
    return { found: false, error: `PowerShell: ${err.message?.slice(0, 200)}` };
  }
}

/**
 * Detecta via certutil -store — funciona pra A3 com KSP/CNG.
 * O certutil é mais robusto que Get-ChildItem porque usa CryptoAPI/CNG
 * diretamente, acessando chaves que o .NET/PowerShell não enxerga.
 */
function detectarViaCertutil(): CertA1Info {
  try {
    const output = execSync('certutil -store -user my', {
      encoding: 'utf-8',
      timeout: CERTUTIL_TIMEOUT_MS,
      windowsHide: true,
    });

    logger.debug('Output certutil (raw):', output.slice(0, 800));

    if (!output || !output.trim()) {
      return { found: false, error: 'certutil retornou vazio' };
    }

    // Parse do output do certutil — separa por blocos de certificado
    const certBlocks = output.split(/={5}\s*Certificado\s+\d+\s*={5}/);
    const certs: ParsedCert[] = [];

    for (const block of certBlocks) {
      if (!block.trim()) continue;

      const cert = parseCertutilBlock(block);
      if (cert) {
        certs.push(cert);
      }
    }

    if (certs.length === 0) {
      return { found: false, error: 'Nenhum cert. válido encontrado via certutil' };
    }

    // Filtra: só certs ICP-Brasil (e-CPF ou OAB) não expirados
    // Para A3, mesmo com "ERRO" na verificação, o certificado é válido se tem provider e é ICP-Brasil
    const now = new Date();
    const validCerts = certs.filter(c => {
      if (!c.notAfter) return false;
      const expiry = new Date(c.notAfter);
      if (expiry < now) return false;
      // Aceita ICP-Brasil (AC OAB, AC Raiz, AC SAFEWEB, etc.)
      if (!c.isICPBrasil) return false;
      // Para A3: aceita mesmo com erro na verificação (comportamento normal do KSP/CNG)
      // Para A1: precisa ter passado no teste de criptografia
      if (c.provider && /SafeSign|SafeID|Gemalto|Tecpri|Aventra|TokenMaster|e-Pass|IcpBrazil/i.test(c.provider)) {
        return true; // A3: aceita sempre se é provider de token
      }
      return c.hasPrivateKeyTest; // A1: precisa de chave funcional
    });

    if (validCerts.length === 0) {
      return { found: false, error: 'Nenhum cert. ICP-Brasil válido encontrado via certutil' };
    }

    // Prioriza cert. OAB (ADV), senão pega o primeiro
    const cert = validCerts.find(c => c.subject.includes('ADVOGADO') || c.subject.includes('OAB'))
      || validCerts[0];

    const certType = detectCertType(cert);
    const result = buildResultFromCertutil(cert, certType);

    logger.info('Cert. detectado via certutil:', {
      subject: cert.subject,
      certType,
      provider: cert.provider,
    });

    return result;
  } catch (err: any) {
    logger.warn('certutil detection failed:', err.message?.slice(0, 200));
    return { found: false, error: `certutil: ${err.message?.slice(0, 200)}` };
  }
}

// ============================================================
//  Helpers de parse do certutil
// ============================================================

interface ParsedCert {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  thumbprint: string;
  provider: string;
  keyExportable: boolean;
  isICPBrasil: boolean;
  hasPrivateKeyTest: boolean;
}

function parseCertutilBlock(block: string): ParsedCert | null {
  try {
    // Subject / Requerente
    const subjectMatch = block.match(/Requerente:\s*(.+)/);
    const subject = subjectMatch?.[1]?.trim() || '';

    // Issuer / Emissor
    const issuerMatch = block.match(/Emissor:\s*(.+)/);
    const issuer = issuerMatch?.[1]?.trim() || '';

    // Serial
    const serialMatch = block.match(/(?:N.mero de S.rie|Serial Number):\s*(\S+)/i);
    const serialNumber = serialMatch?.[1] || '';

    // Dates
    const notBeforeMatch = block.match(/NotBefore:\s*(.+)/);
    const notAfterMatch = block.match(/NotAfter:\s*(.+)/);
    const notBefore = notBeforeMatch?.[1]?.trim() || '';
    const notAfter = notAfterMatch?.[1]?.trim() || '';

    // Thumbprint (Hash Cert sha1)
    const thumbMatch = block.match(/Hash Cert\(sha1\):\s*(\S+)/i);
    const thumbprint = thumbMatch?.[1]?.toUpperCase() || '';

    // Provider
    const providerMatch = block.match(/Provider\s*=\s*(.+)/);
    const provider = providerMatch?.[1]?.trim() || '';

    // Key exportable
    const exportable = !block.includes('chave privada N.O . export.vel') && !block.includes('não é exportável');

    // ICP-Brasil check
    const isICPBrasil = /ICP-Brasil/i.test(issuer) || /ICP-Brasil/i.test(subject)
      || /AC OAB/i.test(issuer) || /AC RAIZ/i.test(issuer)
      || /AC SAFEWEB/i.test(issuer) || /Receita Federal/i.test(issuer);

    // Crypto test result
    const hasPrivateKeyTest = !block.includes('FALHA no teste de criptografia')
      && !block.includes('ERRO:') && !block.includes('N.o . poss.vel');

    return {
      subject,
      issuer,
      serialNumber,
      notBefore,
      notAfter,
      thumbprint,
      provider,
      keyExportable: exportable,
      isICPBrasil,
      hasPrivateKeyTest,
    };
  } catch {
    return null;
  }
}

function detectCertType(cert: ParsedCert): 'A1' | 'A3' {
  // A3: tokens/smart cards usam providers como SafeSign, SafeID, Gemalto, etc.
  const a3Providers = /SafeSign|SafeID|Gemalto|Tecpri|Aventra|Certisign|TokenMaster|e-Pass|IcpBrazil/i;
  if (a3Providers.test(cert.provider)) return 'A3';

  // A3: subject tipico de token (Assinatura Tipo A3, OU=ADVOGADO)
  if (/Tipo A3|ADVOGADO/i.test(cert.subject)) return 'A3';

  // Default: A1
  return 'A1';
}

// ============================================================
//  Builders de resultado
// ============================================================

function buildResult(cert: any, certType: 'A1' | 'A3'): CertA1Info {
  const cpfMatch = cert.Subject?.match(/(\d{11})/);
  const cpf = cpfMatch ? cpfMatch[1] : undefined;

  const validTo = new Date(cert.NotAfter);
  const now = new Date();
  const daysToExpire = Math.floor((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  return {
    found: true,
    certType,
    subject: cert.Subject,
    cpf,
    issuer: cert.Issuer,
    validFrom: cert.NotBefore,
    validTo: cert.NotAfter,
    expired: validTo < now,
    daysToExpire,
    hasPrivateKey: cert.HasPrivateKey,
    thumbprint: cert.Thumbprint,
  };
}

function buildResultFromCertutil(cert: ParsedCert, certType: 'A1' | 'A3'): CertA1Info {
  const cpfMatch = cert.subject.match(/(\d{11})/);
  const cpf = cpfMatch ? cpfMatch[1] : undefined;

  // Parse date (formato: "28/07/2026 14:45")
  const parseDate = (dateStr: string): Date | null => {
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (!match) return null;
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]), parseInt(match[4]), parseInt(match[5]));
  };

  const validTo = parseDate(cert.notAfter);
  const now = new Date();
  const daysToExpire = validTo
    ? Math.floor((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : undefined;

  return {
    found: true,
    certType,
    subject: cert.subject,
    cpf,
    issuer: cert.issuer,
    validFrom: cert.notBefore,
    validTo: cert.notAfter,
    expired: validTo ? validTo < now : false,
    daysToExpire,
    hasPrivateKey: cert.hasPrivateKeyTest,
    thumbprint: cert.thumbprint,
    provider: cert.provider,
    keyExportable: cert.keyExportable,
  };
}

/**
 * Lista TODOS os certs. do Windows Cert Store (debug).
 * CurrentUser + LocalMachine — usa certutil como fallback.
 */
export function listarTodosCerts(): Array<{ subject: string; issuer: string; hasPrivateKey: boolean; expired: boolean; certType?: string; provider?: string }> {
  try {
    const output = execSync('certutil -store -user my', {
      encoding: 'utf-8',
      timeout: CERTUTIL_TIMEOUT_MS,
      windowsHide: true,
    });
    if (!output.trim()) return [];

    const certBlocks = output.split(/={5}\s*Certificado\s+\d+\s*={5}/);
    const certs: Array<{ subject: string; issuer: string; hasPrivateKey: boolean; expired: boolean; certType?: string; provider?: string }> = [];

    for (const block of certBlocks) {
      if (!block.trim()) continue;
      const parsed = parseCertutilBlock(block);
      if (!parsed) continue;

      const certType = detectCertType(parsed);
      certs.push({
        subject: parsed.subject,
        issuer: parsed.issuer,
        hasPrivateKey: parsed.hasPrivateKeyTest,
        expired: parsed.notAfter ? new Date(parsed.notAfter) < new Date() : false,
        certType,
        provider: parsed.provider,
      });
    }

    return certs;
  } catch (err: any) {
    logger.error('Erro ao listar certs:', err.message);
    return [];
  }
}
