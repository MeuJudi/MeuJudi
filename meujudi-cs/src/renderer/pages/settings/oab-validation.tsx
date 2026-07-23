/**
 * Tela de status da validação de OAB (Fase 3 + botão manual).
 *
 * O CS abre a página oficial do ConfirmADV em uma BrowserWindow separada
 * (não-iframe) — esta tela é só um espelho do estado e um ponto pra
 * abrir/reabrir a janela quando o advogado precisar.
 *
 * O botão "Verificar OAB agora" pode ser clicado várias vezes. A cada
 * clique o CS consulta o Web, e se houver validação pendente, abre a
 * janela. Após uma validação terminar, o CS fica pronto para a
 * próxima tentativa sem precisar reiniciar.
 */

import { useEffect, useState } from 'react';
import type { ConfirmADVValidation } from '@shared/types';

const STAGES = [
  { id: 1, label: 'Dados profissionais' },
  { id: 2, label: 'Conectar MeuJudi CS' },
  { id: 3, label: 'Confirmar no ConfirmADV' },
  { id: 4, label: 'Liberar escritorio' },
] as const;

type CheckResult =
  | { status: 'opened'; validation: ConfirmADVValidation }
  | { status: 'already_open'; validation: ConfirmADVValidation }
  | { status: 'no_pending' }
  | { status: 'not_paired' }
  | { status: 'error'; message: string };

export default function OabValidationPage() {
  const [current, setCurrent] = useState<ConfirmADVValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await window.meujudi.oab.getCurrent();
        if (!cancelled) {
          setCurrent(next);
        }
      } catch {
        // polling silencioso — se falhar, tenta de novo no próximo tick
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Botão principal: verifica pendente e abre. Pode ser clicado várias vezes.
  async function handleCheck() {
    setIsChecking(true);
    setError(null);
    setInfo(null);
    try {
      const result: CheckResult = await window.meujudi.oab.checkAndOpen();
      switch (result.status) {
        case 'opened':
          setInfo(`Janela aberta para OAB ${result.validation.oab_number}/${result.validation.oab_uf}. Resolva o reCAPTCHA e o codigo de e-mail.`);
          setCurrent(result.validation);
          break;
        case 'already_open':
          setInfo(`Ja existe uma janela aberta para OAB ${result.validation.oab_number}/${result.validation.oab_uf}.`);
          setCurrent(result.validation);
          break;
        case 'no_pending':
          setError('Nenhuma solicitacao pendente no momento. Crie uma no MeuJudi Web primeiro.');
          break;
        case 'not_paired':
          setError('CS nao esta pareado com nenhum escritorio. Acesse Configuracoes - Conectar ao MeuJudi Web.');
          break;
        case 'error':
          setError(result.message);
          break;
      }
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel consultar.');
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <a href="../index.html" className="text-sm text-gray-500 hover:text-gray-700">Voltar</a>
          <h1 className="mt-1 text-3xl font-bold">Validacao de OAB</h1>
          <p className="mt-1 text-gray-500">
            O MeuJudi CS abre a pagina oficial do ConfirmADV. Voce resolve o reCAPTCHA e o codigo enviado
            ao e-mail profissional manualmente. A janela fecha sozinha apos a verificacao e o escritorio
            fica liberado no Web.
          </p>
        </header>

        <ol className="card space-y-3">
          {STAGES.map((stage) => (
            <li key={stage.id} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                {stage.id}
              </span>
              <span className="text-sm font-medium text-gray-700">{stage.label}</span>
            </li>
          ))}
        </ol>

        {/* Status da inscricao (subscription) atual */}
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600">Status atual</h2>
            <span className="text-xs text-gray-400">atualiza a cada 5s</span>
          </div>
          {current ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-wider text-amber-700">Em andamento</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">
                OAB {current.oab_number}/{current.oab_uf}
              </p>
              <p className="text-xs text-amber-800">
                {current.requester_name} · {current.professional_email}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm text-gray-600">Nenhuma validacao em andamento no momento.</p>
            </div>
          )}
        </section>

        {/* Botao principal: consulta e abre a janela. Pode ser clicado varias vezes. */}
        <section className="card space-y-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={isChecking}
            className="btn-primary w-full text-base"
          >
            {isChecking ? 'Consultando...' : '🛡️ Verificar OAB agora'}
          </button>
          <p className="text-xs text-gray-500">
            O CS consulta o MeuJudi Web e, se houver solicitacao pendente, abre a janela oficial do ConfirmADV.
            Apos a verificacao (sucesso ou nao), o botao pode ser usado novamente para a proxima validacao.
          </p>
        </section>

        {/* Feedback apos click */}
        {info ? (
          <div className="card border-green-300 bg-green-50 text-sm text-green-800">{info}</div>
        ) : null}
        {error ? (
          <div className="card border-red-300 bg-red-50 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="card space-y-2 bg-blue-50 text-xs text-blue-900">
          <p>
            <strong>Como funciona:</strong> clique no botao acima. O CS consulta o Web, e se houver
            validacao pendente, abre a pagina do ConfirmADV em uma janela propria. A pagina e a oficial
            do ConfirmADV - voce resolve o reCAPTCHA e o codigo de e-mail manualmente.
          </p>
          <p>
            <strong>Privacidade:</strong> o CS limpa todos os cookies e o armazenamento da pagina oficial
            quando a janela fecha. Nenhum token de reCAPTCHA, codigo de e-mail ou sessao do ConfirmADV e
            enviado ao MeuJudi Web.
          </p>
        </section>
      </div>
    </main>
  );
}
