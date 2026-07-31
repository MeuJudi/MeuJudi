/**
 * PdpjConcurrencyPanel — controle de teste da concorrência de janelas PDPJ
 * (ver meujudi-cs/src/main/pdpj-concurrency.ts) direto na tela de
 * Diagnóstico, sem precisar editar o arquivo de config na mão.
 *
 * Mostra também um resumo das últimas chamadas ao PDPJ (sucesso/erro por
 * status), puxado dos logs recentes — pra acompanhar o teste sem abrir a
 * tela de Logs separada.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PdpjConcurrencyStatus, LogEntry } from '@shared/types';

const JANELA_RESUMO_MIN = 15;

interface ResumoChamadas {
  total: number;
  porStatus: Record<string, number>;
  ultimoRateLimit: string | null;
}

function resumirLogs(logs: LogEntry[]): ResumoChamadas {
  const desde = Date.now() - JANELA_RESUMO_MIN * 60_000;
  const porStatus: Record<string, number> = {};
  let total = 0;
  let ultimoRateLimit: string | null = null;

  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    if (ts < desde) continue;
    if (log.message === 'PDPJ requisicao concluida' && log.context?.statusCode !== undefined) {
      total += 1;
      const status = String(log.context.statusCode);
      porStatus[status] = (porStatus[status] ?? 0) + 1;
    }
    if (log.message?.includes('HTTP 429 recebido')) {
      ultimoRateLimit = log.timestamp;
    }
  }
  return { total, porStatus, ultimoRateLimit };
}

function formatarContagem(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min <= 0 ? 'agora' : `em ${min}min`;
}

export function PdpjConcurrencyPanel() {
  const [status, setStatus] = useState<PdpjConcurrencyStatus | null>(null);
  const [valorInput, setValorInput] = useState('2');
  const [salvando, setSalvando] = useState(false);
  const [resumo, setResumo] = useState<ResumoChamadas>({ total: 0, porStatus: {}, ultimoRateLimit: null });

  const carregarStatus = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const s = await window.meujudi.pdpj.getConcurrency();
      setStatus(s);
      setValorInput(String(s.configurado));
    } catch {
      // silencioso — painel opcional, nao trava a tela de diagnostico
    }
  }, []);

  const carregarResumo = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const logs = await window.meujudi.diagnostic.getLogs(500);
      setResumo(resumirLogs(logs));
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    carregarStatus();
    carregarResumo();
    const interval = setInterval(() => {
      carregarStatus();
      carregarResumo();
    }, 10_000);
    return () => clearInterval(interval);
  }, [carregarStatus, carregarResumo]);

  async function aplicar() {
    const n = Number(valorInput);
    if (!Number.isFinite(n) || n < 1) return;
    setSalvando(true);
    try {
      const s = await window.meujudi.pdpj.setConcurrency(n);
      setStatus(s);
    } finally {
      setSalvando(false);
    }
  }

  if (!status) return null;

  const statusOrdenados = Object.entries(resumo.porStatus).sort((a, b) => Number(a[0]) - Number(b[0]));
  const temErro = statusOrdenados.some(([s]) => Number(s) >= 400);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">🧪 Teste de concorrência do PDPJ</h2>
        {status.emCooldown && status.cooldownAteMs && (
          <span className="text-xs rounded-full bg-red-50 text-red-700 px-2 py-1">
            ⚠️ Travado em 1 (429 recente) — volta ao normal {formatarContagem(status.cooldownAteMs - Date.now())}
          </span>
        )}
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Janelas simultâneas (config)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={valorInput}
            onChange={(e) => setValorInput(e.target.value)}
            className="border rounded px-2 py-1 w-20 text-sm"
          />
        </div>
        <button onClick={aplicar} disabled={salvando} className="btn-primary text-sm">
          {salvando ? 'Aplicando...' : 'Aplicar'}
        </button>
        <div className="text-sm text-gray-500">
          Efetivo agora: <span className="font-mono font-semibold">{status.efetivo}</span>
          {status.emCooldown && <span className="text-red-600"> (forçado por 429)</span>}
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs text-gray-500 mb-1">Últimos {JANELA_RESUMO_MIN}min de chamadas ao PDPJ</p>
        {resumo.total === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma chamada registrada ainda nessa janela.</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-gray-600">{resumo.total} no total</span>
            {statusOrdenados.map(([s, count]) => (
              <span
                key={s}
                className={`rounded-full px-2 py-0.5 text-xs font-mono ${Number(s) >= 400 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {s}: {count}
              </span>
            ))}
          </div>
        )}
        {resumo.ultimoRateLimit && (
          <p className="text-xs text-red-600 mt-1">
            Último 429: {new Date(resumo.ultimoRateLimit).toLocaleTimeString('pt-BR')}
          </p>
        )}
        {temErro && !resumo.ultimoRateLimit && (
          <p className="text-xs text-amber-600 mt-1">
            Tem erro na janela, mas não é 429 (pode ser o "sem acesso a processo específico", já esperado).
          </p>
        )}
      </div>
    </div>
  );
}
