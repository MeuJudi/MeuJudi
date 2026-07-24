// Detecta texto que estruturalmente não tem como conter prazo/audiência
// extraível — evita gastar Camada 4 (Sonnet) num texto onde a IA nunca vai
// achar nada. Confirmado com dados reais em produção (24/07/2026): as 3
// tentativas de Camada 4 que caíram em textos como esses voltaram 100% com
// tudo `null` — a informação real só existe no PDF/anexo da comunicação, que
// o sistema ainda não lê, nunca no texto curto do Mural em si.
//
// Não filtra texto com conteúdo real — só os casos mais óbvios (título
// isolado sem contexto, ou um template genérico de "acesse o sistema pra
// mais detalhes" já visto na prática). Lista viva: mesma lógica de
// `patterns.ts` — quando aparecer um novo padrão comprovadamente inútil,
// adiciona aqui.

const LIMITE_CARACTERES_MINIMO = 20;

const PADROES_SEM_INFORMACAO_UTIL: RegExp[] = [
  // TJPR/Projudi: aviso genérico de movimentação, só aponta pro sistema —
  // visto na prática apontando pra "OUTRAS DECISÕES" sem nenhum dado de
  // prazo no próprio texto (a data ali é a data do movimento, não um prazo).
  // CUIDADO: esse MESMO template também é usado pra audiências reais (ex.:
  // "... AUDIÊNCIA DE CONCILIAÇÃO DESIGNADA (06/07/2026). Acesse..." — a
  // data ali É a data da audiência). Achado revisando dados reais em
  // 24/07/2026: a versão anterior desse regex descartava esses casos sem
  // nem tentar extrair. O `(?!.*AUDI[ÊE]NCIA)` garante que só pula quando o
  // texto do movimento não menciona audiência — esses casos já têm regex
  // dedicado em `REGEX_AUDIENCIA_V2` (patterns.ts).
  /^Intima[çc][ãa]o\s+referente\s+ao\s+movimento\s+\(seq\.?\s*\d+\)\s+(?!.*AUDI[ÊE]NCIA).+?\.\s*Acesse\s+o\s+sistema\s+\w+.*?para\s+mais\s+detalhes\.?$/i,

  // === Achados na varredura completa das 4.440 comunicações do Mural, 24/07/2026 ===
  // Audiência REALIZADA/NÃO REALIZADA/CANCELADA: mesmo template do Projudi
  // acima, mas relatando algo que já aconteceu (ou não vai acontecer) — a
  // data entre parênteses é do evento passado, não uma audiência futura pra
  // extrair. Complementa (não substitui) a regex de extração em
  // `REGEX_AUDIENCIA_V2`, que só aceita o verbo (RE)DESIGNADA.
  /AUDI[ÊE]NCIA\s+D[EO]\s+[\wÀ-ÿ.\s]+?\s+(?:N[ÃA]O\s+)?REALIZADA\s*\(\d{2}\/\d{2}\/\d{4}\)/i,
  /AUDI[ÊE]NCIA\s+D[EO]\s+[\wÀ-ÿ.\s]+?\s+CANCELADA\s*\(\d{2}\/\d{2}\/\d{4}\)/i,

  // Processo sigiloso: o texto nem chega a ser visível — não tem como ter
  // informação nenhuma pra extrair.
  /^Processo\s+sigiloso\b/i,

  // "Tomar ciência do(a) Intimação de ID X. Intimado(s)/Citado(s) - NOME":
  // só avisa que existe um documento pra consultar, sem prazo/audiência no
  // próprio texto (o conteúdo real está no documento referenciado, que o
  // sistema ainda não lê).
  /^Tomar\s+ci[êe]ncia\s+do\(a\)\s+Intima[çc][ãa]o\s+de\s+ID\s+\w+\./i,

  // "Lista de distribuição": só avisa que um processo novo foi distribuído
  // pra uma vara/câmara, com link pro sistema — nunca tem prazo/audiência/
  // valor, é sempre a data de distribuição, não uma data de audiência.
  /^Processo\s+[\d.\-\/]+\s+distribu[íi]?do\s+para\s+.+?\s+na\s+data\s+(?:de\s+)?\d{2}\/\d{2}\/\d{4}/i,

  // "Ata da Nª sessão ... realizada entre/ao(s) ...": registro de uma sessão
  // de julgamento que JÁ aconteceu — não é uma audiência futura, é histórico.
  /\bAta\s+d[ae]\s+\d+ª?\s+sess[ãa]o\b.*?\brealizad[ao]\b/i,

  // "EXTRATO DE ATA DA SESSÃO [PRESENCIAL|VIRTUAL] DE DATA": mesma ideia,
  // variante de cabeçalho diferente — histórico de sessão já ocorrida.
  /^EXTRATO\s+DE\s+ATA\s+DA\s+SESS[ÃA]O\b/i,

  // "Ata de Distribuição de processos para Revisor...": registro de
  // distribuição pro revisor, com a data da distribuição (não prazo/audiência).
  /^Ata\s+de\s+Distribui[çc][ãa]o\s+de\s+processos\s+para\s+Revisor\b/i,
];

/**
 * true = não vale a pena chamar IA pra este texto (nenhum regex bateu e o
 * texto não tem nenhum sinal reconhecível de prazo/audiência).
 */
export function textoSemInformacaoExtraivel(texto: string): boolean {
  const limpo = (texto ?? "").trim();
  if (limpo.length < LIMITE_CARACTERES_MINIMO) return true;
  return PADROES_SEM_INFORMACAO_UTIL.some((padrao) => padrao.test(limpo));
}
