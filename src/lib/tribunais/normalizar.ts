export function normalizarTribunalSigla(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const normalizado = valor.trim().toUpperCase();
  return normalizado || null;
}
