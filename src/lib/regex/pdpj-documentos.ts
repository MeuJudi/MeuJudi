/**
 * Extracao deterministica para o texto dos documentos devolvidos pelo PDPJ.
 *
 * O texto do PDPJ e diferente do Mural: normalmente e texto puro, com cabecalho
 * repetido em cada documento e despachos longos. Por isso este modulo devolve
 * evidencias e todos os prazos encontrados; a camada seguinte decide o que e
 * atual, historico ou apenas referencia legal.
 */

export type TipoDocumentoPdpj = "despacho" | "decisao" | "sentenca" | "acordao" | "peticao" | "outro";

export type EvidenciaPdpj = {
  valor: string;
  contexto: string;
  indice: number;
};

export type PrazoPdpj = EvidenciaPdpj & {
  dias: number;
  unidade: "dias" | "horas";
  uteis: boolean;
  sujeito: string | null;
};

export type DocumentoPdpjExtraido = {
  tipo: TipoDocumentoPdpj;
  processo: string | null;
  classeProcessual: string | null;
  assuntoPrincipal: string | null;
  valorCausa: string | null;
  orgaoJulgador: string | null;
  magistrado: string | null;
  partes: { polo: "ativo" | "passivo"; nome: string }[];
  prazos: PrazoPdpj[];
  audiencias: EvidenciaPdpj[];
  evidencias: Record<string, EvidenciaPdpj | null>;
};

function semAcentos(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizarTextoPdpj(value: string) {
  return semAcentos(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limpar(value: string | undefined | null) {
  return value?.replace(/\s+/g, " ").replace(/^[\s:;-]+|[\s.;,]+$/g, "").trim() || null;
}

function evidencia(texto: string, match: RegExpExecArray, valor: string) {
  const inicio = Math.max(0, match.index - 120);
  const fim = Math.min(texto.length, match.index + match[0].length + 180);
  return { valor: valor.trim(), contexto: texto.slice(inicio, fim).replace(/\s+/g, " ").trim(), indice: match.index };
}

function primeiro(texto: string, regex: RegExp, grupo = 1) {
  const match = regex.exec(texto);
  return match && match[grupo] ? evidencia(texto, match, match[grupo]) : null;
}

function classificarDocumento(texto: string): TipoDocumentoPdpj {
  const cabecalho = texto.slice(0, 900);
  const marcador = (nome: string) => new RegExp(`(?:^|\\n)\\s*${nome}(?:\\s|$)`, "i").test(cabecalho);
  if (marcador("ACORDAO")) return "acordao";
  if (marcador("SENTENCA")) return "sentenca";
  if (marcador("PETICAO")) return "peticao";
  if (marcador("DESPACHO")) return "despacho";
  if (marcador("DECISAO")) return "decisao";
  return "outro";
}

function extrairPrazos(texto: string): PrazoPdpj[] {
  const encontrados: PrazoPdpj[] = [];
  const regex = /(?:no prazo de|prazo de|em)\s+(\d+)\s*(?:\([^)]*\)\s*)?(dias?|horas?)(?:\s+(uteis))?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto))) {
    const unidade = match[2].toLowerCase().startsWith("hora") ? "horas" : "dias";
    const item = evidencia(texto, match, match[0]);
    const antes = texto.slice(Math.max(0, match.index - 100), match.index);
    encontrados.push({
      ...item,
      dias: Number(match[1]),
      unidade,
      uteis: Boolean(match[3]),
      sujeito: limpar(antes.match(/(?:intime-se|intimar|manifeste-se|manifestar-se)\s+(?:a|o|as|os)?\s*([^,.;]{3,100})$/i)?.[1]),
    });
  }
  return encontrados;
}

function extrairAudiencias(texto: string): EvidenciaPdpj[] {
  const encontrados: EvidenciaPdpj[] = [];
  const regex = /(?:(?:audiencia|sessao de julgamento|pauta de julgamento)[\s\S]{0,180}?(?:designada|redesignada|agendada|paute-se|retire-se de pauta|realizada|compareceram)[\s\S]{0,100}|(?:paute-se|retire-se de pauta)[\s\S]{0,100}(?:audiencia|sessao de julgamento|pauta de julgamento)[\s\S]{0,100})/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto))) encontrados.push(evidencia(texto, match, match[0]));
  return encontrados;
}

export function extrairDocumentoPdpj(textoOriginal: string): DocumentoPdpjExtraido {
  const texto = normalizarTextoPdpj(textoOriginal);
  const processo = primeiro(texto, /\bProcesso\s*:\s*([0-9]{7,}-?[0-9.\-]{8,})/i);
  const classe = primeiro(texto, /Classe Processual\s*:\s*([^\n]{3,160}?)(?=\s+Assunto Principal\s*:|\s+Valor da Causa\s*:)/i);
  const assunto = primeiro(texto, /Assunto Principal\s*:\s*([^\n]{3,160}?)(?=\s+Valor da Causa\s*:|\s+Exequente|\s+Autor|\s+Requerente)/i);
  const valor = primeiro(texto, /Valor da Causa\s*:\s*(R\$\s*[\d.,]+)/i);
  const orgao = primeiro(texto, /(?:Orgao Julgador|Origem)\s*:\s*([^\n]{3,180})/i);
  const magistrado = primeiro(texto, /(?:Juiz(?:a)? de Direito|Desembargador(?:a)?|Relator(?:a)?)\s*[:\-]?\s*([A-Z][A-Z .'-]{3,100})/i);

  const partes: DocumentoPdpjExtraido["partes"] = [];
  for (const polo of ["ativo", "passivo"] as const) {
    const label = polo === "ativo" ? "(?:Exequente|Autor|Requerente)" : "(?:Executado|Reu|Requerido)";
    const match = new RegExp(`${label}\\(s\\)?\\s*:\\s*([^\\n]{3,180})`, "i").exec(texto);
    const nome = limpar(match?.[1]);
    if (nome) partes.push({ polo, nome });
  }

  const evidencias: DocumentoPdpjExtraido["evidencias"] = { processo, classeProcessual: classe, assuntoPrincipal: assunto, valorCausa: valor, orgaoJulgador: orgao, magistrado };
  return { tipo: classificarDocumento(texto), processo: processo?.valor ?? null, classeProcessual: classe?.valor ?? null, assuntoPrincipal: assunto?.valor ?? null, valorCausa: valor?.valor ?? null, orgaoJulgador: orgao?.valor ?? null, magistrado: magistrado?.valor ?? null, partes, prazos: extrairPrazos(texto), audiencias: extrairAudiencias(texto), evidencias };
}
