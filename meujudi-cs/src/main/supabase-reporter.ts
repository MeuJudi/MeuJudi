/**
 * MeuJudi CS - Supabase Reporter
 *
 * Sends sanitized DiagnosticReport payloads to public.diagnostic_reports.
 * Prefer SUPABASE_ANON_KEY/publishable key. Do not ship service_role in desktop builds.
 */

import { logger } from './logger';
import type { DiagnosticReport, DiagnosticReportDB } from '../shared/types';

const TABLE_NAME = 'diagnostic_reports';
const TIMEOUT_MS = 15_000;
const DEFAULT_SUPABASE_URL = 'https://lsuhkzvbzgkbjyfuppeg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_TH3aLztSSpaAJ_tKym-ewg_F1ZxYofZ';

export async function enviarRelatorioSupabase(report: DiagnosticReport): Promise<{
  sent: boolean;
  id?: string;
  error?: string;
}> {
  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || DEFAULT_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Supabase nao configurado (SUPABASE_URL/SUPABASE_ANON_KEY ausentes). Pulando envio.');
    return { sent: false, error: 'Supabase nao configurado (env vars ausentes)' };
  }

  try {
    const dbRow: Partial<DiagnosticReportDB> & Record<string, unknown> = {
      id: report.id,
      meu_judi_version: report.meuJudiVersion,
      electron_version: report.electronVersion,
      node_version: report.nodeVersion,
      windows_version: report.windowsVersion,
      arch: report.arch,
      hostname: report.hostname,
      overall_success: report.overallSuccess,
      cert_a1_found: report.certA1.found,
      cert_a1_cpf: report.certA1.cpf || null,
      cert_a1_expired: report.certA1.expired || null,
      pje_reachable: report.pjeConnection.reachable,
      pje_login_succeeded: report.pjeLogin.succeeded,
      pje_user_id: report.pjeLogin.userId || null,
      cert_popup_appeared: report.certPopup.appeared,
      cert_popup_cancelled: report.certPopup.cancelled,
      cookies_count: report.cookies.count,
      cookies_has_session: report.cookies.hasSession,
      cookies_has_xsrf: report.cookies.hasXsrf,
      total_errors: report.errors.length,
      total_warnings: report.warnings.length,
      recent_logs_count: report.recentLogs?.length || 0,
      last_error: report.errors[report.errors.length - 1] || null,
      source: 'meujudi-cs',
      trigger_reason: (report as DiagnosticReport & { triggerReason?: string }).triggerReason || null,
      report_json: report,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${supabaseUrl}/rest/v1/${TABLE_NAME}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(dbRow),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      logger.error(`Supabase retornou HTTP ${response.status}:`, text.slice(0, 300));
      return { sent: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }

    logger.info(`Relatorio enviado pro Supabase: ${report.id}`);
    return { sent: true, id: report.id };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error('Timeout ao enviar pro Supabase');
      return { sent: false, error: 'Timeout' };
    }
    logger.error('Erro ao enviar pro Supabase:', err.message);
    return { sent: false, error: err.message?.slice(0, 200) };
  }
}
