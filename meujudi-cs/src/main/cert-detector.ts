/**
 * MeuJudi CS — CertDetector
 *
 * Detecta cert. A1 (e-CPF) instalado no Windows Cert Store.
 * Usa PowerShell pra listar e parsear (mais robusto que node-forge pra isso).
 */

import { execSync } from 'child_process';
import { logger } from './logger';
import type { CertA1Info } from '../shared/types';

const POWERSHELL_TIMEOUT_MS = 10_000;

/**
 * Detecta cert. A1 (e-CPF A1) no Windows Cert Store do usuário atual.
 * Retorna CertA1Info (found: false se não achou ou deu erro).
 */
export function detectarCertA1(): CertA1Info {
  const start = Date.now();
  try {
    logger.info('Detectando cert. A1 no Windows Cert Store...');

    // PowerShell que lista certs com private key, não expirados
    const psCommand = `
      $certs = Get-ChildItem -Path "Cert:\\CurrentUser\\My" -ErrorAction SilentlyContinue |
        Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
        Select-Object Subject, NotBefore, NotAfter, Thumbprint, Issuer, HasPrivateKey
      $certs | ConvertTo-Json -Depth 2
    `;

    const output = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
    });

    logger.debug('Output PowerShell (raw):', output.slice(0, 500));

    if (!output || !output.trim() || output.trim() === 'null') {
      logger.info('Nenhum cert. com private key encontrado no Cert Store');
      return {
        found: false,
        error: 'Nenhum certificado com chave privada encontrado em Cert:\\CurrentUser\\My',
      };
    }

    // PowerShell retorna um objeto OU um array
    const parsed = JSON.parse(output);
    const certs = Array.isArray(parsed) ? parsed : [parsed];

    if (certs.length === 0) {
      return {
        found: false,
        error: 'Nenhum cert. com private key e não expirado encontrado',
      };
    }

    // Filtra certs. A1 (e-CPF) — Subject contém "ICP-Brasil" ou é e-CPF
    // Heurística: pega o primeiro cert. que tem padrão de CPF no Subject (11 dígitos)
    let cert = certs.find((c: any) => /\d{11}/.test(c.Subject)) || certs[0];

    // Extrai CPF do Subject (formato típico: "NOME SOBRENOME:CPF" ou "CN=nome:CPF")
    const cpfMatch = cert.Subject.match(/(\d{11})/);
    const cpf = cpfMatch ? cpfMatch[1] : undefined;

    const validTo = new Date(cert.NotAfter);
    const now = new Date();
    const daysToExpire = Math.floor((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    const result: CertA1Info = {
      found: true,
      subject: cert.Subject,
      cpf,
      issuer: cert.Issuer,
      validFrom: cert.NotBefore,
      validTo: cert.NotAfter,
      expired: validTo < now,
      daysToExpire,
      thumbprint: cert.Thumbprint,
    };

    logger.info('Cert. A1 detectado:', {
      cpf,
      subject: cert.Subject,
      daysToExpire,
      expired: result.expired,
    });

    return result;
  } catch (err: any) {
    logger.error('Erro ao detectar cert. A1:', err.message);
    return {
      found: false,
      error: `Erro ao executar PowerShell: ${err.message?.slice(0, 200)}`,
    };
  } finally {
    logger.debug(`Detecção levou ${Date.now() - start}ms`);
  }
}

/**
 * Lista TODOS os certs. do Windows Cert Store (debug).
 */
export function listarTodosCerts(): Array<{ subject: string; issuer: string; hasPrivateKey: boolean; expired: boolean }> {
  try {
    const psCommand = `
      Get-ChildItem -Path "Cert:\\CurrentUser\\My" -ErrorAction SilentlyContinue |
        Select-Object Subject, Issuer, HasPrivateKey, NotAfter |
        ConvertTo-Json -Depth 2
    `;
    const output = execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
    });
    if (!output.trim() || output.trim() === 'null') return [];
    const parsed = JSON.parse(output);
    const certs = Array.isArray(parsed) ? parsed : [parsed];
    return certs.map((c: any) => ({
      subject: c.Subject,
      issuer: c.Issuer,
      hasPrivateKey: c.HasPrivateKey,
      expired: new Date(c.NotAfter) < new Date(),
    }));
  } catch (err: any) {
    logger.error('Erro ao listar certs:', err.message);
    return [];
  }
}
