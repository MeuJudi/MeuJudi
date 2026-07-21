// Validador de segurança de regex — rejeita padrões que podem causar
// catastrophic backtracking (ReDoS) antes deles entrarem em produção.
//
// Ver docs/roadmap/08-ia-regex.md seção 5.3 e
// docs/roadmap/08-implementacao/02-seguranca-redos-guard.md.
//
// HISTÓRICO DE CORREÇÕES (achadas rodando os testes reais deste arquivo):
//
// v1: tentava medir um timeout com `Date.now()` em volta de `regex.test()`
// síncrono. Isso NÃO funciona em JavaScript — o event loop é single-threaded,
// então uma regex genuinamente catastrófica (ex: `(a|a)+$` contra 40 "a"s)
// trava a thread inteira antes do relógio ser checado de novo. Travou o
// próprio teste por minutos até ser morto manualmente.
//
// v2: trocou o timeout síncrono por análise estática via `safe-regex`
// (nunca executa o padrão, então nunca pode travar) + execução com strings
// adversariais bem curtas como camada extra. Mas `safe-regex` não pega
// alternância redundante simples (`(a|a)+`, sem aninhamento de quantificador)
// — ficou com falso negativo comprovado em teste. E encurtar a string
// executada o bastante pra nunca travar também a torna curta demais pra
// disparar o timeout nesse tipo de padrão — o mesmo trade-off do v1, só que
// mais bem escondido.
//
// v3: a única forma de ter timeout REAL em cima de execução síncrona em JS é
// rodar fora da thread principal. Usa `worker_threads` com `terminate()` de
// verdade se o teste não responder a tempo — preempção genuína, não é mais
// uma corrida contra o relógio. A validação continua rara (só quando uma
// regex é criada/editada — Camada 5, painel Super Admin), então o custo de
// subir uma worker thread por validação é aceitável.
//
// v4 (atual): rodando a Camada 5 com o Opus de verdade, o `safe-regex`
// rejeitou um padrão perfeitamente seguro (`(?:grupo com +)?` seguido de
// outros grupos opcionais/alternância) — mesmo subindo o limite até 100, a
// biblioteca continuava marcando como inseguro. Só que a execução REAL desse
// mesmo padrão contra strings adversariais de até 500 caracteres rodou em
// 0ms — prova de que era falso positivo. Revendo o histórico dos testes,
// `safe-regex` nunca foi a camada que realmente pegou um caso verdadeiro
// (a|a)+ foi pego pela execução em worker thread, não por ele. Rebaixado
// pra sinal consultivo (aparece no log, não bloqueia mais sozinho) — a
// autoridade final é sempre a execução real em worker thread, que é o único
// teste que mede o que realmente importa (tempo de execução de verdade) em
// vez de estimar.

import { Worker } from "node:worker_threads";
import safeRegex from "safe-regex";

// Pré-filtro estrutural rápido: cobre os casos mais óbvios sem gastar nem a
// análise estática nem a worker thread.
//
// CORREÇÃO (achada testando com o Opus de verdade, Parte 6): a primeira
// versão marcava `[+*?]` como quantificador de risco depois de um grupo já
// quantificado — mas `?` (0-ou-1) NÃO cria repetição nenhuma, então não tem
// como causar backtracking catastrófico, não importa o que tenha dentro do
// grupo. `(?:designad[oa]s?\s+)?` (grupo com `+` interno, quantificado com
// `?` por fora) é uma construção comum e segura, e estava sendo rejeitada
// por engano. O padrão de risco de verdade exige que o grupo seja repetido
// 2+ vezes por fora (`+`, `*` ou `{n,}`), não 0-ou-1 vez.
const PADROES_ESTRUTURAIS_ARRISCADOS: RegExp[] = [
  /\([^()]*[+*]\)[+*]/,
  /\([^()]*\+[^()]*\)\{/,
];

// String adversarial mais longa agora é segura de usar: roda numa worker
// thread com terminate() garantido, não trava mais a thread principal
// independente do tamanho.
const STRINGS_ADVERSARIAIS: string[] = [
  "a".repeat(40) + "!",
  "0".repeat(40) + "x",
  "a".repeat(41) + "b",
  " ".repeat(40) + "\n",
];

export type MotivoReprovacao =
  | "padrao_estrutural_arriscado"
  | "timeout_em_teste_adversarial"
  | "regex_invalida";

export interface ResultadoValidacaoSeguranca {
  seguro: boolean;
  motivo?: MotivoReprovacao;
  detalhe?: string;
  /** Sinal consultivo do safe-regex — não bloqueia sozinho (ver histórico v4 acima), só informativo. */
  avisoAnaliseEstatica?: boolean;
}

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const { padrao, flags, texto } = workerData;
try {
  const re = new RegExp(padrao, flags);
  const bateu = re.test(texto);
  parentPort.postMessage({ ok: true, bateu });
} catch (err) {
  parentPort.postMessage({ ok: false, erro: String(err && err.message ? err.message : err) });
}
`;

/**
 * Roda `new RegExp(padrao, flags).test(texto)` numa worker thread separada,
 * com terminate() real se estourar o timeout. É a única forma correta de
 * impor um limite de tempo em cima de uma regex potencialmente catastrófica
 * em JavaScript (não dá pra preemptar código síncrono na mesma thread).
 */
function testarRegexComTimeoutReal(
  padrao: string,
  flags: string,
  texto: string,
  timeoutMs: number,
): Promise<{ estourouTimeout: boolean; erro?: string }> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { padrao, flags, texto },
    });

    const timer = setTimeout(() => {
      worker.terminate().finally(() => resolve({ estourouTimeout: true }));
    }, timeoutMs);

    worker.once("message", (msg: { ok: boolean; erro?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ estourouTimeout: false, erro: msg.ok ? undefined : msg.erro });
    });

    worker.once("error", (err: Error) => {
      clearTimeout(timer);
      resolve({ estourouTimeout: false, erro: err.message });
    });
  });
}

export async function validarSegurancaRegex(
  padrao: string,
  flags = "i",
  timeoutMs = 100,
): Promise<ResultadoValidacaoSeguranca> {
  // Camada 1: pré-filtro estrutural (rápido, legível, cobre os casos óbvios)
  for (const risco of PADROES_ESTRUTURAIS_ARRISCADOS) {
    if (risco.test(padrao)) {
      return {
        seguro: false,
        motivo: "padrao_estrutural_arriscado",
        detalhe: `Padrão bate com estrutura de risco conhecida: ${risco}`,
      };
    }
  }

  try {
    // eslint-disable-next-line no-new -- só valida que compila antes de ir pra worker
    new RegExp(padrao, flags);
  } catch (err) {
    return { seguro: false, motivo: "regex_invalida", detalhe: (err as Error).message };
  }

  // Camada 2: análise estática do safe-regex — CONSULTIVA, não bloqueia
  // sozinha (ver histórico v4). Tem falsos positivos comprovados (padrões
  // com vários grupos opcionais/alternância, comuns em sugestões do Opus) e
  // nunca foi, nos nossos testes, a camada que realmente pegou um caso
  // catastrófico de verdade — isso sempre foi a Camada 3 (execução real).
  const avisoAnaliseEstatica = !safeRegex(padrao, { limit: 25 });

  // Camada 3 (AUTORITATIVA): execução real numa worker thread com
  // terminate() de verdade se travar — mede o que realmente importa (tempo
  // de execução real), não uma estimativa.
  for (const adversarial of STRINGS_ADVERSARIAIS) {
    const resultado = await testarRegexComTimeoutReal(padrao, flags, adversarial, timeoutMs);
    if (resultado.estourouTimeout) {
      return {
        seguro: false,
        motivo: "timeout_em_teste_adversarial",
        detalhe: `Não respondeu em ${timeoutMs}ms contra string adversarial — terminada via worker.terminate()`,
        avisoAnaliseEstatica,
      };
    }
    if (resultado.erro) {
      return { seguro: false, motivo: "regex_invalida", detalhe: resultado.erro, avisoAnaliseEstatica };
    }
  }

  return { seguro: true, avisoAnaliseEstatica };
}
