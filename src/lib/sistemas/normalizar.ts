export function normalizarSistemaNome(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const original = valor.trim();
  if (!original) return null;

  const chave = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  if (chave === "invalido") return null;
  if (chave === "eproc") return "EPROC";
  if (chave === "pje") return "PJe";
  if (chave === "projudi") return "Projudi";
  if (chave === "saj" || chave === "esaj") return "SAJ";

  return original;
}
