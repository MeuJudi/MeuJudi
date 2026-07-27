/**
 * DiagnosticViewer — mostra o último relatório de diagnóstico do MeuJudi CS.
 * Usado na página de configurações / status.
 */

import { useState, useEffect } from 'react';
import type { DiagnosticReport } from '@shared/types';

export function DiagnosticViewer() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ sent: boolean; error?: string } | null>(null);

  useEffect(() => {
    loadLast();
  }, []);

  async function loadLast() {
    if (!window.meujudi) return;
    try {
      const last = await window.meujudi.diagnostic.getLast();
      setReport(last);
    } catch (err) {
      console.error('Erro ao carregar último relatório:', err);
    }
  }

  async function runDiagnostic() {
    setIsRunning(true);
    setSendStatus(null);
    try {
      const r = await window.meujudi.diagnostic.run();
      setReport(r);
    } catch (err: any) {
      console.error('Erro no diagnóstico:', err);
      alert('Erro no diagnóstico: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  }

  async function sendToSupabase() {
    if (!report) return;
    setSendStatus(null);
    try {
      const result = await window.meujudi.diagnostic.sendToSupabase(report);
      setSendStatus(result);
    } catch (err: any) {
      setSendStatus({ sent: false, error: err.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">🔍 Diagnóstico</h2>
          <div className="flex gap-2">
            <button
              onClick={loadLast}
              disabled={isRunning}
              className="btn-secondary text-sm"
            >
              🔄 Recarregar
            </button>
            <button
              onClick={runDiagnostic}
              disabled={isRunning}
              className="btn-primary text-sm"
            >
              {isRunning ? '🔄 Rodando...' : '▶️ Executar diagnóstico'}
            </button>
          </div>
        </div>

        {report ? <DiagnosticSummary report={report} /> : (
          <p className="text-gray-500 text-center py-8">
            Nenhum diagnóstico executado ainda. Clique em "Executar diagnóstico".
          </p>
        )}

        {report && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex gap-2">
              <button
                onClick={sendToSupabase}
                disabled={sendStatus?.sent}
                className="btn-primary text-sm"
              >
                {sendStatus?.sent ? '✅ Enviado pro Supabase' : '📤 Enviar pro Supabase'}
              </button>
              {sendStatus?.error && (
                <span className="text-sm text-red-600 self-center">
                  Erro: {sendStatus.error}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {report && <DiagnosticDetails report={report} />}
    </div>
  );
}

function DiagnosticSummary({ report }: { report: DiagnosticReport }) {
  const overall = report.overallSuccess;
  return (
    <div className={`p-4 rounded-lg ${overall ? 'bg-green-50' : 'bg-red-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{overall ? '✅' : '⚠️'}</span>
        <h3 className={`text-lg font-semibold ${overall ? 'text-green-800' : 'text-red-800'}`}>
          {overall ? 'Diagnóstico OK' : 'Problemas encontrados'}
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-gray-600">Cert. A1</p>
          <p className="font-mono">
            {!report.certA1.found ? '❌' : report.certA1.expired ? '❌ Expirado' : '✅'}
          </p>
        </div>
        <div>
          <p className="text-gray-600">PJe</p>
          <p className="font-mono">{report.pjeConnection.reachable ? '✅' : '❌'}</p>
        </div>
        <div>
          <p className="text-gray-600">Cookies</p>
          <p className="font-mono">{report.cookies.hasSession ? `✅ ${report.cookies.count}` : '⚠️ 0'}</p>
        </div>
        <div>
          <p className="text-gray-600">Erros</p>
          <p className="font-mono">{report.errors.length}</p>
        </div>
      </div>

      {report.errors.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-red-700 text-sm">Erros:</p>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
            {report.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-yellow-700 text-sm">Avisos:</p>
          <ul className="list-disc list-inside text-sm text-yellow-600 space-y-0.5">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-blue-700 text-sm">Recomendações:</p>
          <ul className="list-disc list-inside text-sm text-blue-600 space-y-0.5">
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DiagnosticDetails({ report }: { report: DiagnosticReport }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-3">📋 Detalhes técnicos</h3>
      <div className="space-y-2 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-gray-500">Versão MeuJudi CS:</span>
          <span>{report.meuJudiVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Electron:</span>
          <span>{report.electronVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Windows:</span>
          <span>{report.windowsVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Hostname:</span>
          <span>{report.hostname}</span>
        </div>
        <hr />
        <div className="flex justify-between">
          <span className="text-gray-500">Cert. A1 encontrado:</span>
          <span>{report.certA1.found ? '✅ Sim' : '❌ Não'}</span>
        </div>
        {report.certA1.found && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500">CPF:</span>
              <span>{report.certA1.cpf || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Subject:</span>
              <span className="truncate ml-2">{report.certA1.subject || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expira em:</span>
              <span>
                {report.certA1.daysToExpire !== undefined
                  ? `${report.certA1.daysToExpire} dias`
                  : '—'}
              </span>
            </div>
          </>
        )}
        <hr />
        <div className="flex justify-between">
          <span className="text-gray-500">PJe acessível:</span>
          <span>
            {report.pjeConnection.reachable ? '✅' : '❌'}
            {report.pjeConnection.latencyMs !== undefined && ` (${report.pjeConnection.latencyMs}ms)`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Cookies salvos:</span>
          <span>
            {report.cookies.hasSession ? `✅ ${report.cookies.count} cookies` : '⚠️ Nenhum'}
          </span>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          📄 Ver JSON completo
        </summary>
        <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}
