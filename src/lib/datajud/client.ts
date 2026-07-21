// Cliente HTTP do DataJud (API pública do CNJ). Cada CNJ mora num tribunal
// específico, mas não dá pra saber qual só olhando o número — por isso
// `buscarProcessoEmTribunais` tenta os candidatos em ordem (ver
// tribunal-from-cnj.ts) até achar. Uma chamada = um processo específico já
// conhecido; não existe "varredura" nessa API (só o Mural descobre processo
// novo). Ver docs/roadmap/06-edge-datajud.md.

const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br/api_publica_";

export interface DataJudMovimento {
  dataHora: string;
  codigo: number;
  nome: string;
  complementosTabelados?: Array<{ nome: string }>;
  orgaoJulgador?: { nome?: string; codigo?: string };
}

export interface DataJudProcesso {
  numeroProcesso: string;
  classe?: { codigo: number; nome: string };
  assuntos?: unknown[];
  orgaoJulgador?: { nome?: string; codigo?: number };
  sistema?: { nome: string };
  grau?: string;
  dataHoraUltimaAtualizacao: string;
  movimentos?: DataJudMovimento[];
}

class DataJudHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DataJudHttpError";
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 2000 } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 404/400 não adianta tentar de novo — o tribunal/query está errado, não é transitório.
      if (err instanceof DataJudHttpError && (err.status === 404 || err.status === 400)) {
        throw err;
      }
      if (attempt === maxAttempts) break;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Consulta um CNJ específico num tribunal específico, com retry/backoff. */
export async function consultarDataJud(
  cnj: string,
  tribunal: string,
  apiKey: string,
): Promise<DataJudProcesso | null> {
  return withRetry(
    async () => {
      const url = `${DATAJUD_BASE}${tribunal}/_search`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APIKey ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: { match: { numeroProcesso: cnj.replace(/\D/g, "") } },
          size: 1,
        }),
      });

      if (response.status === 404) throw new DataJudHttpError("Tribunal não existe", 404);
      if (response.status === 429) throw new DataJudHttpError("Rate limit", 429);
      if (!response.ok) throw new DataJudHttpError(`HTTP ${response.status}`, response.status);

      const data = await response.json();
      return (data?.hits?.hits?.[0]?._source as DataJudProcesso | undefined) ?? null;
    },
    { maxAttempts: 3, baseDelay: 2000 },
  );
}

/** Tenta os tribunais candidatos em ordem, para no primeiro que encontrar o processo. */
export async function buscarProcessoEmTribunais(
  cnj: string,
  tribunaisCandidatos: string[],
  apiKey: string,
): Promise<{ processo: DataJudProcesso; tribunalUsado: string } | null> {
  for (const tribunal of tribunaisCandidatos) {
    try {
      const processo = await consultarDataJud(cnj, tribunal, apiKey);
      if (processo) return { processo, tribunalUsado: tribunal };
    } catch (err) {
      if (err instanceof DataJudHttpError && err.status === 404) continue;
      if (err instanceof DataJudHttpError && err.status === 429) {
        console.warn(`[datajud] Rate limit em ${tribunal}, aguardando 10s`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        continue;
      }
      console.error(`[datajud] Erro em ${tribunal}:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
