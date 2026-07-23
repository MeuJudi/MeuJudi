// Classificação de urgência (Parte 9): decide se um caso processa em tempo
// real ou entra na fila de lote (Batch API da Anthropic, ~50% mais barato).
// Ver docs/roadmap/08-ia-regex.md seção 12.

export interface ContextoUrgencia {
  prazoDiasDetectado?: number | null;
  dataAudienciaDetectada?: string | null; // ISO
  prioridadeLegal?: string[] | null; // ex: ['Idoso', 'Idoso acima de 80 Anos']
  /**
   * Sinal fraco (regex permissivo/tipo de movimentação) de que o texto pode
   * ser urgente, usado quando não foi possível detectar prazo/audiência
   * estruturados ainda. Ver detectar-sinal-urgencia.ts — achado 02 da
   * auditoria de 23/07/2026: sem isso, os pollers automáticos sempre
   * classificavam como "lote" nesse ponto, mesmo quando o texto podia ser
   * urgente de verdade.
   */
  sinalFracoDeUrgencia?: boolean | null;
}

export type ClassificacaoUrgencia = "tempo_real" | "lote";

export interface ResultadoClassificacao {
  classificacao: ClassificacaoUrgencia;
  motivo: string;
}

const LIMITE_PRAZO_DIAS = 5;
const LIMITE_AUDIENCIA_DIAS = 7;

/**
 * Regra PROVISÓRIA de urgência (decisão de 17/07/2026 — ver 08-ia-regex.md
 * seção 12). Documentada como provisória de propósito: precisa de 2-4
 * semanas de dado real de uso antes de apertar/afrouxar os limites — toda
 * classificação é registrada em `classificacao_urgencia_log` pra viabilizar
 * essa recalibração depois.
 */
export function classificarUrgencia(contexto: ContextoUrgencia): ResultadoClassificacao {
  if (contexto.prioridadeLegal && contexto.prioridadeLegal.length > 0) {
    return { classificacao: "tempo_real", motivo: `prioridade_legal: ${contexto.prioridadeLegal.join(", ")}` };
  }

  if (contexto.prazoDiasDetectado != null && contexto.prazoDiasDetectado <= LIMITE_PRAZO_DIAS) {
    return { classificacao: "tempo_real", motivo: `prazo_curto: ${contexto.prazoDiasDetectado} dias` };
  }

  if (contexto.dataAudienciaDetectada) {
    const diasAteAudiencia = Math.ceil(
      (new Date(contexto.dataAudienciaDetectada).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (diasAteAudiencia <= LIMITE_AUDIENCIA_DIAS) {
      return { classificacao: "tempo_real", motivo: `audiencia_proxima: ${diasAteAudiencia} dias` };
    }
  }

  if (contexto.sinalFracoDeUrgencia) {
    return { classificacao: "tempo_real", motivo: "sinal_fraco_de_urgencia_no_texto" };
  }

  return { classificacao: "lote", motivo: "sem_sinal_de_urgencia" };
}
