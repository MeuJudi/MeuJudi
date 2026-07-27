export type MuralComunicacao = {
  id: number;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string;
  nomeOrgao: string;
  texto: string;
  numero_processo: string;
  meio: string;
  link: string;
  nomeClasse: string;
  codigoClasse: string;
  destinatarios: Array<{ nome: string; comunicacao_id: number; polo: string }>;
  destinatarioadvogados: Array<{ advogado: { nome: string; numero_oab: string; uf_oab: string } }>;
};

type MuralResponse = { items: MuralComunicacao[] };
const MURAL_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MuralClient {
  async buscarPorOAB(oab: string, uf: string, dataInicio: string, dataFim: string, pagina = 1, itensPorPagina = 100) {
    const params = new URLSearchParams({ numeroOab: oab, ufOab: uf, pagina: String(pagina), itensPorPagina: String(itensPorPagina), dataDisponibilizacaoInicio: dataInicio, dataDisponibilizacaoFim: dataFim });
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${MURAL_BASE}?${params}`, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
        if (response.ok) return await response.json() as MuralResponse;
        const body = (await response.text()).slice(0, 200);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) throw new Error(`Mural HTTP ${response.status}: ${body}`);
        const retryAfter = Number(response.headers.get('retry-after') ?? 0);
        await sleep(Math.max(retryAfter * 1000, 1000 * attempt * attempt));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nonRetryableHttp = /^Mural HTTP (?!429\b|5\d\d\b)\d\d\d:/.test(message);
        if (nonRetryableHttp || attempt === MAX_ATTEMPTS) throw error instanceof Error && error.name === 'AbortError' ? new Error('Mural timeout apos varias tentativas.') : error;
        await sleep(1000 * attempt * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('Mural nao respondeu.');
  }
}
