// Wrapper da API da Anthropic com 3 níveis de modelo.
// Ver docs/roadmap/08-ia-regex.md seção 6.2 e
// docs/roadmap/08-implementacao/01-fundacao-schema-e-client-ia.md.

import Anthropic from "@anthropic-ai/sdk";
import type { ModeloIA } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Mapeamento tarefa -> nível de modelo.
 * Haiku: ~90% das chamadas (confirmação barata, alto volume)
 * Sonnet: ~9% das chamadas (extração complexa)
 * Opus: <1% das chamadas (só Camada 5 — sugestão de regex nova)
 */
export const TAREFAS = {
  validar_regex: "haiku",
  extrair_prazo_simples: "haiku",
  classificar_intimacao: "haiku",
  resumir_curto: "haiku",

  extrair_prazo_complexo: "sonnet",
  resumir_processo: "sonnet",
  ocr_pdf: "sonnet",

  sugerir_regex: "opus",
} as const satisfies Record<string, ModeloIA>;

export type TarefaIA = keyof typeof TAREFAS;

// Centralizado: trocar de modelo no futuro é mudar só aqui, nunca espalhar
// o model id pelo resto do código.
const MODELOS: Record<ModeloIA, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
};

const PRECOS_USD_POR_TOKEN: Record<ModeloIA, { input: number; output: number }> = {
  haiku: { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  sonnet: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  opus: { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
};

export interface ResultadoChamadaIA {
  texto: string;
  custoUsd: number;
  modelo: string;
  nivelModelo: ModeloIA;
}

export async function chamarIA(
  tarefa: TarefaIA,
  prompt: string,
  maxTokens = 1024,
): Promise<ResultadoChamadaIA> {
  const nivelModelo = TAREFAS[tarefa];
  const modeloId = MODELOS[nivelModelo];

  const response = await client.messages.create({
    model: modeloId,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const primeiroBloco = response.content[0];
  const texto = primeiroBloco?.type === "text" ? primeiroBloco.text : "";

  const { input_tokens, output_tokens } = response.usage;
  const precos = PRECOS_USD_POR_TOKEN[nivelModelo];
  const custoUsd = input_tokens * precos.input + output_tokens * precos.output;

  return { texto, custoUsd, modelo: modeloId, nivelModelo };
}
