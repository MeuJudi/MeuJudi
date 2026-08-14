/**
 * SendLogsPanel — envio sob demanda dos logs locais pro suporte.
 * Só renderiza algo se o dispositivo foi liberado pelo Super Admin
 * (ConnectionStatus.logUploadEnabled) — enquanto não for liberado, o
 * componente não mostra nada (nem aviso), por escolha de produto.
 */

import { useState } from 'react';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

type Preset = '1h' | '24h' | '7d' | 'custom';

const PRESETS: { value: Preset; label: string; hours?: number }[] = [
  { value: '1h', label: 'Última hora', hours: 1 },
  { value: '24h', label: 'Últimas 24h', hours: 24 },
  { value: '7d', label: 'Últimos 7 dias', hours: 24 * 7 },
  { value: 'custom', label: 'Período específico' },
];

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function SendLogsPanel() {
  const connection = useConnectionStatus();
  const [preset, setPreset] = useState<Preset>('24h');
  const [customStart, setCustomStart] = useState(() => toLocalInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInputValue(new Date()));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (!connection.logUploadEnabled) return null;

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const activePreset = PRESETS.find((p) => p.value === preset);
      const periodEnd = preset === 'custom' ? new Date(customEnd) : new Date();
      const periodStart = preset === 'custom' ? new Date(customStart) : new Date(periodEnd.getTime() - (activePreset?.hours ?? 24) * 60 * 60 * 1000);

      const response = await window.meujudi.logs.exportAndSend(periodStart.toISOString(), periodEnd.toISOString());
      if (response.sent) {
        setResult({ ok: true, text: `Enviado: ${response.entryCount} linha(s) importante(s) do período.` });
      } else {
        setResult({ ok: false, text: response.error });
      }
    } catch (err: any) {
      setResult({ ok: false, text: err?.message || 'Falha ao enviar os logs.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-1">Enviar logs pro suporte</h3>
      <p className="text-sm text-gray-500 mb-3">
        Envio liberado pra este dispositivo. Só vai o que é importante (avisos, erros e eventos-chave de login/sessão) — nunca o log inteiro, e segredos já saem mascarados.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPreset(p.value)}
            className={preset === p.value ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <label className="flex items-center gap-1">
            De
            <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex items-center gap-1">
            Até
            <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" />
          </label>
        </div>
      )}
      <button type="button" onClick={handleSend} disabled={sending} className="btn-primary text-sm">
        {sending ? 'Enviando...' : 'Enviar logs'}
      </button>
      {result && (
        <p className={`text-sm mt-2 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>{result.text}</p>
      )}
    </div>
  );
}
