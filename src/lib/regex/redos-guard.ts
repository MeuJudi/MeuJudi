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
// v3 (atual): a única forma de ter timeout REAL em cima de execução síncrona
// em JS é rodar fora da thread principal. Usa `worker_threads` com
// `terminate()` de verdade se o teste não responder a tempo — preempção
// genuína, não é mais uma corrida contra o relógio. A validação continua
// rara (só quando uma regex é criada/editada — Camada 5, painel Super
// Admin), então o custo de subir uma worker thread por validação é aceitável.

import { Worker } from "node:worker_threads";
import safeRegex from "safe-regex";

// Pré-filtro estrutural rápido: cobre os casos mais óbvios sem gastar nem a
// análise estática nem a worker thread.
const PADROES_ESTRUTURAIS_ARRISCADOS: RegExp[] = [
  /\([^()]*[+*]\)[+*?]/,
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
  | "reprovado_analise_estatica"
  | "timeout_em_teste_adversarial"
  | "regex_invalida";

export interface ResultadoValidacaoSeguranca {
  seguro: boolean;
  motivo?: MotivoReprovacao;
  detalhe?: string;
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

  // Camada 2: análise estática (nunca executa, então nunca trava sozinha) —
  // pega grande parte dos casos, mas tem falso negativo conhecido pra
  // alternância redundante simples (ver histórico acima), por isso não é a
  // única linha de defesa.
  if (!safeRegex(padrao, { limit: 25 })) {
    return {
      seguro: false,
      motivo: "reprovado_analise_estatica",
      detalhe: "safe-regex estimou complexidade de pior caso acima do limite seguro",
    };
  }

  // Camada 3 (autoritativa contra os falsos negativos da Camada 2): execução
  // real numa worker thread com terminate() de verdade se travar.
  for (const adversarial of STRINGS_ADVERSARIAIS) {
    const resultado = await testarRegexComTimeoutReal(padrao, flags, adversarial, timeoutMs);
    if (resultado.estourouTimeout) {
      return {
        seguro: false,
        motivo: "timeout_em_teste_adversarial",
        detalhe: `Não respondeu em ${timeoutMs}ms contra string adversarial — terminada via worker.terminate()`,
      };
    }
    if (resultado.erro) {
      return { seguro: false, motivo: "regex_invalida", detalhe: resultado.erro };
    }
  }

  return { seguro: true };
}
