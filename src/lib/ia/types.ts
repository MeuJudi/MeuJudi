// Tipos compartilhados do motor Regex + IA.
// Ver docs/roadmap/08-ia-regex.md e docs/roadmap/08-implementacao/.

export type ModeloIA = "haiku" | "sonnet" | "opus";

export type EstadoRegex = "novo" | "quente" | "confiavel" | "desativada";

export type CampoExtraido = "prazo" | "valor" | "audiencia" | "oab";

export type NivelConfianca = "alta" | "media" | "baixa";

/**
 * Espelha a tabela `regex_metadata` (colunas em inglês, definidas em
 * 20260716000000_foundation_schema.sql e estendidas em
 * 20260718000000_ia_regex_fundacao.sql).
 */
export interface RegexMetadata {
  id: string;
  tenant_id: string | null; // null = regex global (compartilhada entre tenants)
  name: string;
  description: string | null;
  pattern: string;
  flags: string;
  state: EstadoRegex;
  /** Campo que essa regex tenta capturar (prazo/valor/audiencia/oab) — achado como gap de schema na Parte 6. */
  campo: CampoExtraido | null;
  total_uses: number;
  total_hits: number;
  total_errors: number;
  taxa_acerto: number;
  created_by: string;
  texto_exemplo: string | null;
  ultima_validacao_ia: string | null;
  versao: number;
  regex_anterior: string | null;
  motivo_mudanca: string | null;
}

export interface MatchResult {
  match: string | null;
  confianca: NivelConfianca | null;
  validadoIA: boolean;
  regexUsada?: string;
  /** id da regex em `regex_metadata` que gerou o match — necessário pra Camada 3 (Parte 5) registrar a validação contra a regex certa. */
  regexId?: string;
  /** true quando a IA falhou ao validar (erro/timeout/parse) — NUNCA tratar como "correto". */
  incerto?: boolean;
}

export interface ExtracaoCacheEntry {
  hash_texto: string;
  campo: CampoExtraido;
  resultado: Record<string, unknown>;
  confianca: NivelConfianca;
  regex_ou_modelo_usado: string | null;
}

export interface ConsumoIADiario {
  tenant_id: string;
  data: string; // YYYY-MM-DD
  custo_usd_acumulado: number;
  total_chamadas: number;
  teto_atingido: boolean;
}
