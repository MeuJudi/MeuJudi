const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(value: string) {
  return value
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/gi, (entity) => HTML_ENTITY_MAP[entity.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Converte o HTML descritivo enviado pelo Mural em texto legível e seguro. */
export function formatMuralText(value: string | null | undefined) {
  if (!value) return "";

  const formatted = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>\s*<(?:(?:td|th))[^>]*>/gi, " | ")
    .replace(/<\/(?:tr|p|div|li|table)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => decodeEntities(line).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return formatted || "Sem conteúdo informado.";
}
