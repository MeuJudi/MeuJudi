// Sinal FRACO de urgência: usado pelos pollers automáticos (DataJud/Mural)
// no momento em que a extração estruturada de prazo/audiência já falhou, mas
// antes de decidir "tempo real vs fila de lote". Não precisa ser preciso
// (isso é trabalho da Camada 3/4) — só precisa evitar que texto com chance
// real de ser urgente caia direto na fila de lote (que pode levar até 24h).
// Antes deste arquivo, os dois pollers sempre passavam contextoUrgencia
// zerado nesse ponto, o que fazia classificarUrgencia() decidir "lote"
// sempre. Ver docs/roadmap/auditoria-motor-extracao/02-pollers-sempre-classificam-lote.md.

const REGEX_MENCAO_URGENCIA = /\bprazo\b|\baudi[eê]ncia\b|\bintima[cç][ãa]o\b|\bcita[cç][ãa]o\b|\burgente\b/i;

const TIPOS_MOVIMENTACAO_URGENTES = [
  "intimação",
  "intimacao",
  "citação",
  "citacao",
  "audiência",
  "audiencia",
  "pauta",
];

export function detectarSinalFracoDeUrgencia(texto: string, tipoMovimentacao?: string | null): boolean {
  if (texto && REGEX_MENCAO_URGENCIA.test(texto)) return true;

  if (tipoMovimentacao) {
    const tipoNormalizado = tipoMovimentacao.toLowerCase();
    if (TIPOS_MOVIMENTACAO_URGENTES.some((t) => tipoNormalizado.includes(t))) return true;
  }

  return false;
}
