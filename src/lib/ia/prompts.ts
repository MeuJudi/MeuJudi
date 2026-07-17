// Prompts das Camadas 3 (confirmadora) e 4 (generalista).
// Ver docs/roadmap/08-ia-regex.md seção 13.1.

export interface ContextoProcesso {
  classe: string;
  tribunal: string;
  tipo: string;
}

export const PROMPTS = {
  validarRegex: (padrao: string, match: string, texto: string) => `
Você é um auditor de regex para sistema jurídico brasileiro.

REGEX TESTADA: /${padrao}/
MATCH ENCONTRADO: "${match}"
TEXTO COMPLETO: "${texto}"

TAREFA: O match está correto? Responda APENAS com JSON, sem texto antes ou depois:
{
  "correto": true ou false,
  "valor_correto": "valor correto se match estiver errado, ou null",
  "explicacao": "por que está certo/errado"
}
`,

  extrairPrazo: (texto: string, contexto: ContextoProcesso) => `
Você é um assistente jurídico analisando uma comunicação processual brasileira.

TEXTO: "${texto}"

CONTEXTO DO PROCESSO:
- Classe: ${contexto.classe}
- Tribunal: ${contexto.tribunal}
- Tipo de comunicação: ${contexto.tipo}

REGRAS DO CPC (aplicar se o texto mencionar o ato correspondente):
- Contestação = 15 dias
- Recurso de apelação = 15 dias
- Contrarrazões = 15 dias
- Embargos de declaração = 5 dias
- Manifestação sobre laudo pericial = 15 dias

TAREFA: Extraia o prazo e a data de audiência (se houver).

Responda APENAS com JSON, sem texto antes ou depois:
{
  "prazo_dias": número inteiro ou null,
  "prazo_horas": número inteiro ou null,
  "data_audiencia": "YYYY-MM-DD" ou null,
  "fundamento_legal": "art. X do CPC" ou null,
  "confianca": "alta" ou "media" ou "baixa"
}
`,

  sugerirRegex: (texto: string, camposExtraidos: Record<string, unknown>) => `
Você é um engenheiro de regex que ajuda a criar padrões de detecção para textos jurídicos brasileiros.

TEXTO: "${texto}"
CAMPOS EXTRAÍDOS PELA IA (pra confirmar o que a regex deve capturar): ${JSON.stringify(camposExtraidos)}

TAREFA: Crie uma REGEX (sintaxe JavaScript/ECMAScript) que detectaria esse mesmo padrão em textos futuros parecidos.
Considere variações de grafia, sinônimos e acentuação, mas não seja genérico demais a ponto de casar com textos não relacionados.

IMPORTANTE:
- Responda APENAS com a regex, sem delimitadores / /, sem explicação, sem bloco de markdown, sem nenhum texto antes ou depois.
- Não use grupos com quantificadores aninhados (ex: (a+)+) nem alternância redundante (ex: (a|a)+) — isso causa problemas de performance graves.
`,

  classificarIntimacao: (texto: string) => `
Classifique esta intimação jurídica brasileira.

TEXTO: "${texto}"

Responda APENAS com JSON, sem texto antes ou depois:
{
  "urgencia": "alta" ou "media" ou "baixa",
  "acao_sugerida": "descrição curta da ação que o advogado deve tomar",
  "prazo_dias": número inteiro ou null,
  "tipo_real": "intimacao_pessoal" ou "intimacao_por_edital" ou "pauta" ou "outro"
}
`,
};
