/**
 * Tabela de honorários advocatícios sugeridos
 *
 * Baseada na Tabela de Honorários Advocatícios publicada pela OAB
 * (modelo referência — valores aproximados e meramente sugestivos).
 *
 * Cada escritório pode editar `valor_escritorio` para refletir o que pratica,
 * sem alterar `valor_sugerido_oab` (referência OAB).
 */

export type HonorarioCategoria =
  | "consultoria"
  | "peticao"
  | "audiencia"
  | "recurso"
  | "contrato"
  | "direito_trabalho"
  | "direito_civil"
  | "direito_familia"
  | "direito_penal"
  | "direito_tributario"
  | "direito_empresarial"
  | "direito_consumidor"
  | "direito_imobiliario"
  | "extrajudicial"
  | "diligencia";

export type HonorarioSeed = {
  categoria: HonorarioCategoria;
  servico: string;
  descricao: string;
  unidade: "hora" | "servico" | "mes" | "consulta" | "percentual" | "fixo";
  valor_sugerido_oab: number;
  valor_minimo?: number;
  valor_maximo?: number;
  base_legal?: string;
};

export const HONORARIOS_SEED: HonorarioSeed[] = [
  // Consultoria
  {
    categoria: "consultoria",
    servico: "consulta_advocaticia_simples",
    descricao: "Consulta verbal com parecer informal",
    unidade: "consulta",
    valor_sugerido_oab: 350,
    valor_minimo: 250,
    valor_maximo: 600,
  },
  {
    categoria: "consultoria",
    servico: "consulta_advocaticia_parecer",
    descricao: "Parecer escrito detalhado",
    unidade: "servico",
    valor_sugerido_oab: 1500,
    valor_minimo: 800,
    valor_maximo: 3500,
  },
  {
    categoria: "consultoria",
    servico: "assessoria_juridica_mensal",
    descricao: "Assessoria mensal para pessoa jurídica",
    unidade: "mes",
    valor_sugerido_oab: 4500,
    valor_minimo: 2000,
    valor_maximo: 12000,
  },

  // Petição
  {
    categoria: "peticao",
    servico: "peticao_inicial_simples",
    descricao: "Petição inicial sem complexidade",
    unidade: "servico",
    valor_sugerido_oab: 2500,
    valor_minimo: 1500,
    valor_maximo: 5000,
  },
  {
    categoria: "peticao",
    servico: "peticao_inicial_complexa",
    descricao: "Petição inicial com complexidade/tutela de urgência",
    unidade: "servico",
    valor_sugerido_oab: 5000,
    valor_minimo: 3000,
    valor_maximo: 12000,
  },
  {
    categoria: "peticao",
    servico: "contestacao",
    descricao: "Contestação com preliminares e mérito",
    unidade: "servico",
    valor_sugerido_oab: 3500,
    valor_minimo: 2000,
    valor_maximo: 8000,
  },
  {
    categoria: "peticao",
    servico: "replica",
    descricao: "Réplica / razões finais",
    unidade: "servico",
    valor_sugerido_oab: 1800,
    valor_minimo: 1000,
    valor_maximo: 4000,
  },

  // Audiência
  {
    categoria: "audiencia",
    servico: "audiencia_conciliacao",
    descricao: "Audiência de conciliação/mediação",
    unidade: "servico",
    valor_sugerido_oab: 1200,
    valor_minimo: 600,
    valor_maximo: 3000,
  },
  {
    categoria: "audiencia",
    servico: "audiencia_instrucao",
    descricao: "Audiência de instrução e julgamento",
    unidade: "servico",
    valor_sugerido_oab: 2500,
    valor_minimo: 1200,
    valor_maximo: 6000,
  },
  {
    categoria: "audiencia",
    servico: "audiencia_una",
    descricao: "Audiência UNA (cível)",
    unidade: "servico",
    valor_sugerido_oab: 1500,
    valor_minimo: 800,
    valor_maximo: 4000,
  },

  // Recurso
  {
    categoria: "recurso",
    servico: "recurso_apelacao",
    descricao: "Recurso de apelação",
    unidade: "servico",
    valor_sugerido_oab: 4000,
    valor_minimo: 2500,
    valor_maximo: 9000,
  },
  {
    categoria: "recurso",
    servico: "recurso_agravo",
    descricao: "Agravo de instrumento / regimental",
    unidade: "servico",
    valor_sugerido_oab: 2500,
    valor_minimo: 1500,
    valor_maximo: 6000,
  },
  {
    categoria: "recurso",
    servico: "embargos_declaracao",
    descricao: "Embargos de declaração",
    unidade: "servico",
    valor_sugerido_oab: 1500,
    valor_minimo: 800,
    valor_maximo: 3500,
  },
  {
    categoria: "recurso",
    servico: "recurso_especial_extraordinario",
    descricao: "Recurso Especial / Extraordinário (STJ/STF)",
    unidade: "servico",
    valor_sugerido_oab: 8000,
    valor_minimo: 5000,
    valor_maximo: 18000,
  },

  // Contrato
  {
    categoria: "contrato",
    servico: "contrato_simples",
    descricao: "Elaboração/revisão de contrato simples",
    unidade: "servico",
    valor_sugerido_oab: 1800,
    valor_minimo: 1000,
    valor_maximo: 5000,
  },
  {
    categoria: "contrato",
    servico: "contrato_complexo",
    descricao: "Contrato complexo (societário, M&A, etc.)",
    unidade: "servico",
    valor_sugerido_oab: 6500,
    valor_minimo: 3500,
    valor_maximo: 25000,
  },

  // Direito do Trabalho
  {
    categoria: "direito_trabalho",
    servico: "trabalho_reclamatoria_simples",
    descricao: "Reclamação trabalhista - verbas simples",
    unidade: "servico",
    valor_sugerido_oab: 3000,
    valor_minimo: 1500,
    valor_maximo: 8000,
  },
  {
    categoria: "direito_trabalho",
    servico: "trabalho_acordo_percentual",
    descricao: "Honorários sobre acordo (20-30% do valor)",
    unidade: "percentual",
    valor_sugerido_oab: 20,
    valor_minimo: 15,
    valor_maximo: 30,
    base_legal: "Art. 791-A, CLT",
  },

  // Direito de Família
  {
    categoria: "direito_familia",
    servico: "divorcio_consensual",
    descricao: "Divórcio consensual (sem bens a partilhar)",
    unidade: "servico",
    valor_sugerido_oab: 2500,
    valor_minimo: 1500,
    valor_maximo: 5000,
  },
  {
    categoria: "direito_familia",
    servico: "divorcio_contencioso",
    descricao: "Divórcio litigioso com partilha",
    unidade: "servico",
    valor_sugerido_oab: 6000,
    valor_minimo: 3000,
    valor_maximo: 15000,
  },
  {
    categoria: "direito_familia",
    servico: "inventario",
    descricao: "Inventário judicial/extrajudicial",
    unidade: "servico",
    valor_sugerido_oab: 8000,
    valor_minimo: 4000,
    valor_maximo: 25000,
  },

  // Penal
  {
    categoria: "direito_penal",
    servico: "penal_assistencia_acusacao",
    descricao: "Assistência à acusação",
    unidade: "servico",
    valor_sugerido_oab: 5000,
    valor_minimo: 2500,
    valor_maximo: 15000,
  },
  {
    categoria: "direito_penal",
    servico: "penal_defesa_crime_simples",
    descricao: "Defesa em crime de menor potencial ofensivo",
    unidade: "servico",
    valor_sugerido_oab: 3500,
    valor_minimo: 1500,
    valor_maximo: 8000,
  },
  {
    categoria: "direito_penal",
    servico: "penal_defesa_crime_complexo",
    descricao: "Defesa em crime complexo (tribunal do júri)",
    unidade: "servico",
    valor_sugerido_oab: 12000,
    valor_minimo: 6000,
    valor_maximo: 35000,
  },

  // Extrajudicial
  {
    categoria: "extrajudicial",
    servico: "notificacao_extrajudicial",
    descricao: "Notificação/interpelação extrajudicial",
    unidade: "servico",
    valor_sugerido_oab: 800,
    valor_minimo: 500,
    valor_maximo: 2000,
  },
  {
    categoria: "extrajudicial",
    servico: "usucapiao_extrajudicial",
    descricao: "Usucapião extrajudicial (em cartório)",
    unidade: "servico",
    valor_sugerido_oab: 5000,
    valor_minimo: 2500,
    valor_maximo: 12000,
  },
  {
    categoria: "extrajudicial",
    servico: "diligencia_cartorio",
    descricao: "Diligência em cartório/órgão público",
    unidade: "fixo",
    valor_sugerido_oab: 350,
    valor_minimo: 200,
    valor_maximo: 800,
  },
];
