import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { usePairing } from '@/hooks/usePairing';
import type { HistoricalSyncStatus } from '@shared/types';

export default function PairingPage() {
  const { status, isLoading, error, submitCode, unpair } = usePairing();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [historicalRunning, setHistoricalRunning] = useState(false);
  const [historicalStatus, setHistoricalStatus] = useState<HistoricalSyncStatus | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!scannerOpen) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!stopped && video && canvas && video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context && canvas.width > 0) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          if (result?.data && /^[A-HJ-NP-Z2-9]{8}$/.test(result.data.trim().toUpperCase())) {
            setCode(result.data.trim().toUpperCase());
            setScannerOpen(false);
            return;
          }
        }
      }
      if (!stopped) frame = requestAnimationFrame(scan);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((nextStream) => {
      if (stopped) { nextStream.getTracks().forEach((track) => track.stop()); return; }
      stream = nextStream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); }
      frame = requestAnimationFrame(scan);
    }).catch(() => setMessage('Nao foi possivel acessar a camera. Digite o codigo manualmente.'));
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scannerOpen]);

  useEffect(() => {
    if (!historicalRunning) return;
    const refresh = () => window.meujudi.mural.getHistoricalStatus().then(setHistoricalStatus).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, [historicalRunning]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const result = await submitCode(code);
    if (result) { setCode(''); setMessage('Dispositivo conectado com sucesso.'); }
  }

  async function handleHistoricalSync() {
    setMessage(null);
    setHistoricalRunning(true);
    try {
      const result = await window.meujudi.mural.syncHistorical();
      if (!result) return;
      setMessage(`Importacao concluida: ${result.recebidas} comunicacoes recebidas, ${result.novas} novas e ${result.puladas} ja existentes.`);
    } catch (err: any) {
      setMessage(err.message || 'A importacao foi interrompida. Ao tentar novamente, ela continuara do ultimo checkpoint.');
    } finally {
      setHistoricalRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <a href="../../index.html" className="text-sm text-gray-500 hover:text-gray-700">Voltar</a>
          <h1 className="mt-1 text-3xl font-bold">Conectar ao MeuJudi Web</h1>
          <p className="mt-1 text-gray-500">Pareie este computador com o escritorio correto para sincronizar o Mural.</p>
        </header>
        {error && <div className="card border-red-300 bg-red-50 text-red-700">{error}</div>}
        {message && <div className="card border-green-300 bg-green-50 text-green-700">{message}</div>}
        {status ? (
          <section className="card space-y-5">
            <div><p className="text-sm font-medium text-green-700">Dispositivo conectado</p><h2 className="mt-2 text-xl font-semibold">{status.tenantName}</h2><p className="text-sm text-gray-500">Pareado por {status.userName}</p></div>
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">O MeuJudi CS pode consultar as OABs deste escritorio e enviar as comunicacoes do Mural para o Web.</p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Importacao historica</p>
              <p className="mt-1">Busca os ultimos 12 meses em lotes semanais. Se houver falha ou voce fechar o CS, a proxima tentativa continua do ponto salvo.</p>
      <button type="button" onClick={handleHistoricalSync} disabled={historicalRunning} className="btn-primary mt-3 w-full">
                {historicalRunning ? 'Importando historico...' : 'Importar ultimos 12 meses'}
              </button>
              {historicalRunning && historicalStatus?.checkpoint?.current ? (
                <p className="mt-2 text-center text-xs text-amber-800">
                  OAB {historicalStatus.checkpoint.current.oab}/{historicalStatus.checkpoint.current.uf} · semana {historicalStatus.checkpoint.current.from} a {historicalStatus.checkpoint.current.to} · página {historicalStatus.checkpoint.current.page}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={unpair} disabled={isLoading} className="btn-danger">Desconectar dispositivo</button>
          </section>
        ) : (
          <section className="card space-y-5">
            <div><h2 className="text-xl font-semibold">Digite o codigo de pareamento</h2><p className="mt-1 text-sm text-gray-500">No MeuJudi Web, abra Configuracoes - MeuJudi CS, gere um codigo e informe aqui.</p></div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8))} placeholder="ABCD2345" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-2xl tracking-[0.18em] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200" />
              <div className="flex flex-wrap gap-2"><button type="submit" disabled={isLoading || code.length !== 8} className="btn-primary flex-1">{isLoading ? 'Conectando...' : 'Conectar dispositivo'}</button><button type="button" onClick={() => setScannerOpen(true)} disabled={isLoading} className="btn-secondary">Escanear QR</button></div>
            </form>
            {scannerOpen && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><video ref={videoRef} className="aspect-video w-full rounded bg-black" muted playsInline /><canvas ref={canvasRef} className="hidden" /><p className="text-xs text-blue-800">Aponte a camera para o QR Code exibido no MeuJudi Web.</p><button type="button" onClick={() => setScannerOpen(false)} className="btn-secondary w-full">Fechar camera</button></div>}
            <p className="text-xs text-gray-400">O codigo expira em 10 minutos e so pode ser usado uma vez.</p>
          </section>
        )}
      </div>
    </main>
  );
}
