// Hash de texto normalizado — base do cache global (Camada -1).
// Ver docs/roadmap/08-ia-regex.md seção 4.

import { createHash } from "node:crypto";

/**
 * Normaliza o texto antes de gerar o hash — remove variações que não mudam
 * o significado (espaços redundantes, aspas curvas) pra que o mesmo conteúdo
 * semântico sempre gere o mesmo hash, mesmo vindo de fontes diferentes
 * (Mural vs PJe vs OCR de PDF) com formatação ligeiramente distinta.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export function hashTexto(texto: string): string {
  const normalizado = normalizarTexto(texto);
  return createHash("sha256").update(normalizado, "utf-8").digest("hex");
}
