"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { gerarCodigoPareamento, revogarDispositivo } from "./actions";

type Device = {
  id: string;
  device_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  status?: string | null;
  last_heartbeat?: string | null;
  last_activity?: string | null;
  pending_tasks?: number | null;
  app_version?: string | null;
};

export function PairingPanel({ devices }: { devices: Device[] }) {
  const [code, setCode] = useState<{ codigo: string; expires_at: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [liveDevices, setLiveDevices] = useState(devices);

  useEffect(() => {
    let active = true;
    async function refreshStatus() {
      try {
        const response = await fetch("/api/cs/status", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { devices?: Device[] };
        if (active && data.devices) setLiveDevices(data.devices);
      } catch {
        // A proxima atualizacao tenta novamente sem interromper a tela.
      }
    }
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!code) return;
    let active = true;
    QRCode.toDataURL(code.codigo, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then((data) => { if (active) setQr(data); })
      .catch(() => { if (active) setQr(null); });
    return () => { active = false; };
  }, [code]);

  function generate() { startTransition(async () => setCode(await gerarCodigoPareamento())); }
  function revoke(id: string) {
    if (!window.confirm("Revogar este dispositivo? Ele precisara ser pareado novamente.")) return;
    startTransition(async () => { await revogarDispositivo(id); window.location.reload(); });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Parear o MeuJudi CS</h2><p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">Gere um codigo para conectar o aplicativo instalado no computador do escritorio. O codigo expira em 10 minutos.</p></div>
          <button type="button" onClick={generate} disabled={pending} className="rounded-md bg-[var(--tenant-brass)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">{pending ? "Gerando..." : "Gerar codigo"}</button>
        </div>
        {code ? <div className="mt-5 flex flex-wrap items-center gap-6 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4"><div><p className="text-xs font-medium text-[var(--color-muted-foreground)]">Digite no CS ou escaneie</p><p className="mt-2 font-mono text-3xl font-bold tracking-[0.18em] text-[var(--color-card-foreground)]">{code.codigo}</p><p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Valido ate {new Date(code.expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div>{qr ? <Image src={qr} alt={`QR Code do pareamento ${code.codigo}`} width={176} height={176} unoptimized className="h-44 w-44 rounded bg-white p-2" /> : <div className="h-44 w-44 animate-pulse rounded bg-[var(--tenant-line)]" />}</div> : null}
      </section>

      <section className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)]">
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Dispositivos pareados</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">O status e atualizado automaticamente enquanto o MeuJudi CS estiver aberto.</p>
        {liveDevices.length === 0 ? <p className="mt-4 rounded-md border border-dashed border-[var(--tenant-line)] p-4 text-sm text-[var(--color-muted-foreground)]">Nenhum dispositivo pareado ainda.</p> : <div className="mt-4 divide-y divide-[var(--tenant-line)]">{liveDevices.map((device) => {
          const online = device.status === "online";
          const lastSeen = device.last_heartbeat ?? device.last_seen_at;
          return <div key={device.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-[var(--color-card-foreground)]">{device.device_name ?? "MeuJudi CS"}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${online ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{online ? "Online" : "Offline"}</span>{device.app_version ? <span className="text-xs text-[var(--color-muted-foreground)]">v{device.app_version}</span> : null}</div><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Ultimo heartbeat: {lastSeen ? new Date(lastSeen).toLocaleString("pt-BR") : "ainda nao conectado"}</p>{device.last_activity ? <p className="text-xs text-[var(--color-muted-foreground)]">Ultima atividade: {device.last_activity} · Tarefas: {device.pending_tasks ?? 0}</p> : null}</div><button type="button" onClick={() => revoke(device.id)} disabled={pending} className="rounded-md border border-[var(--tenant-line)] px-3 py-1.5 text-sm font-medium text-[var(--tenant-wine)] hover:bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] disabled:opacity-50">Revogar</button></div>;
        })}</div>}
      </section>
    </div>
  );
}
