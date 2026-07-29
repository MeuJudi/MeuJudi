// src/lib/regex/patterns.ts
// Regex V2: extrai tipo + data + horário + sala + plataforma
// Versão testada e validada (6/9 audiências detectadas, 4 com horário)

/**
 * Remove tags HTML e normaliza espaços em branco.
 * Os textos do Mural Eletrônico vêm em HTML puro com <section>, <table>,
 * <b>, etc. As regexes precisam de texto limpo pra funcionar.
 */
export function stripHtml(html: string): string {
  return html
    // Remove o CONTEÚDO de <style>/<script>, não só as tags — achado
    // revisando dados reais (24/07/2026): sem isso, o CSS de dentro de
    // <style> sobrava como texto puro (ex.: "body{ padding: 10px;
    // font-family: Times New Roman...") na frente do conteúdo real,
    // poluindo tudo que vem depois (regex, log, e o que seria mandado pra IA).
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")           // remove todas as tags HTML
    .replace(/&nbsp;/g, " ")            // entidades HTML comuns
    .replace(/&ordm;/g, "º")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&acirc;/g, "â")
    .replace(/&ecirc;/g, "ê")
    .replace(/&ocirc;/g, "ô")
    .replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ")
    .replace(/&ccedil;/g, "ç")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")           // entidades numéricas
    .replace(/\s+/g, " ")              // colapsa espaços múltiplos
    .trim();
}

export const REGEX_PRAZO_DIAS = [
  /Prazo:?\s+(\d+)\s+dias?/i,
  /em\s+(\d+)\s+dias(?!\s+[úu]teis)/i,
  /prazo\s+de\s+(\d+)\s+dias/i,
  // [^)]* em vez de \w+: \w é ASCII-only em JS, não bate com acento — "(três)"
  // nunca batia aqui (achado revisando dados reais, 24/07/2026). \s* em vez
  // de \s+ pega também "10(dez)" sem espaço, visto na prática.
  /prazo\s+de\s+(\d+)\s*\([^)]*\)\s*dias/i,
  /intime-se.*?em\s+(\d+)\s+dias/i,
  /manifeste-se.*?em\s+(\d+)\s+dias/i,
  /(\d+)\s+dias?\s+úteis/i,
  // Achados revisando dados reais (24/07/2026): "Prazo: 15 (quinze) dias."
  // e "em 5 (cinco) dias," são formas comuns que a versão anterior das
  // regex acima não cobria.
  /Prazo:?\s+(\d+)\s*\([^)]*\)\s*dias?/i,
  /\bem\s+(\d+)\s*\([^)]*\)\s*dias?/i,
];

/**
 * Números por extenso mais comuns em prazos do CPC/CLT (1 a 90). Não cobre
 * números compostos ("vinte e cinco") — raros nesse contexto; quando
 * aparecer um caso real, adiciona aqui.
 */
const NUMEROS_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90,
};

const REGEX_PRAZO_DIAS_EXTENSO = /(?:\bem|prazo\s+de|prazo:?)\s+([a-zà-ÿ]+)\s+dias?\b/i;

/** Remove acentos pra bater "três"/"tres" contra a mesma chave do mapa. */
function removerAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Fallback pra prazo escrito por extenso sem nenhum dígito ("em cinco dias",
 * "prazo de quinze dias") — achado revisando dados reais, 24/07/2026.
 */
function extrairPrazoDiasExtenso(texto: string): number | null {
  const m = texto.match(REGEX_PRAZO_DIAS_EXTENSO);
  if (!m) return null;
  const palavra = removerAcentos(m[1].toLowerCase());
  return NUMEROS_EXTENSO[palavra] ?? null;
}

export const REGEX_PRAZO_HORAS = [
  /em\s+(\d+)\s+horas?/i,
  /prazo\s+de\s+(\d+)h\b/i,
  /(\d+)h\s+(?:úteis|corridas?)/i,
];

export const REGEX_AUDIENCIA_V2 = [
  // === FORMATOS EXPLÍCITOS (alto grau de certeza) ===
  {
    nome: 'audiência tipo + data + horário + plataforma',
    regex: /Audiência\s+(?:do\s+tipo\s+)?["']([^"']+?)["']\s+designada\s+para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})\s+(?:[àa]s?\s+)?(\d{2})[h:](\d{2})(?:\s+([^,]+?))?(?:\s+recebeu\s+agendamento\s+na\s+plataforma\s+([^.]+?))?/i,
    grupo: { tipo: 1, data: 2, hora: 3, min: 4, local: 5, plataforma: 6 },
  },
  {
    nome: 'pauta de julgamento (período)',
    regex: /Pauta\s+de\s+Julgamento\s+do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}\s+até\s+(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data_inicio: 1, data_fim: 2 },
  },
  {
    nome: 'audiência designada para data',
    regex: /audiência\s+(?:de\s+instrução|de\s+conciliação|una|de\s+encerramento\s+de\s+instrução|inicial|preliminar)?\s*designada\s+para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data: 1 },
  },
  {
    nome: 'sessão de julgamento',
    regex: /sess[ãa]o\s+(virtual\s+)?(?:ordinária|extraordinária)\s+(?:em|para\s+o\s+dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data: 1, tipo: 'sessao' },
  },
  {
    nome: 'data da audiência',
    regex: /data\s+da\s+audiência:?\s*(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data: 1 },
  },
  {
    nome: 'designada para data',
    regex: /designada\s+para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})(?:\s+(?:[àa]s?\s+)?(\d{2})[h:](\d{2}))?/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },

  // === Achados revisando comunicações reais do Mural/DataJud, 24/07/2026 ===
  // (docs/roadmap/auditoria-motor-extracao — motivo: reduzir volume que cai
  // na Camada 4/IA por falta de regex, não porque a informação não existe).
  {
    // "AUDIÊNCIA INICIAL Audiência: 20/10/2026 08:35 (sala 02 - Juíza Substituta)"
    nome: 'rótulo "Audiência:" + data + hora',
    regex: /\bAudiência:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2})[h:](\d{2})/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },
  {
    // "... para o seguinte dia e horário: 03/09/2026 08:40, na modalidade presencial"
    nome: 'dia e horário explícitos',
    regex: /dia\s+e\s+hor[áa]rio:?\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2})[h:](\d{2})/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },
  {
    // "... telepresencial para CONCILIAÇÃO ..., na data de 23/09/2026 às 11:00 - Sala 01"
    nome: 'na data de + às',
    regex: /na\s+data\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]s\s+(\d{2})[h:](\d{2})/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },
  {
    // "redesigno audiência de ENCERRAMENTO DE INSTRUÇÃO, na forma telepresencial, para o dia 10/08/2026 08:35"
    // Variante mais solta da "audiência designada para data": aceita
    // "redesigno"/"designo"/qualquer verbo (não fixa a palavra) e texto
    // entre o tipo da audiência e o "para o dia".
    nome: 'audiência de [tipo], ... para o dia + hora',
    regex: /audiência\s+de\s+[\wÀ-ÿ\s]+?,\s*(?:na\s+forma\s+[\wÀ-ÿ]+,\s*)?para\s+o\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2})[h:](\d{2})/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },
  {
    // Template Projudi: "... AUDIÊNCIA DE CONCILIAÇÃO DESIGNADA (06/07/2026)." ou
    // "... AUDIÊNCIA DO ART. 334 CPC DESIGNADA (25/06/2026)." ou
    // "... AUDIÊNCIA DE INSTRUÇÃO REDESIGNADA (01/04/2026)." — v2 (24/07/2026):
    // "DE" OU "DO" (a primeira versão só aceitava "DE"), e RE-designada
    // também conta. Só extrai quando o verbo é (RE)DESIGNADA — nunca
    // REALIZADA/CANCELADA (ver detectar-texto-sem-informacao.ts: esses
    // casos são passado/negativo, não têm audiência futura pra extrair).
    nome: 'audiência (re)designada (data entre parênteses)',
    regex: /AUDI[ÊE]NCIA\s+D[EO]\s+[\wÀ-ÿ.\s]+?\s+(?:RE)?DESIGNADA\s*\((\d{2}\/\d{2}\/\d{4})\)/i,
    grupo: { data: 1 },
  },
  {
    // "Setor de Pautas Pauta de Julgamento do dia 14/05/2026 13:30 Sessão
    // Ordinária..." — variante de data única (a existente só cobre período
    // "do dia X até Y").
    nome: 'pauta de julgamento (data única)',
    regex: /Pauta\s+de\s+Julgamento\s+do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})\s+Sess[ãa]o/i,
    grupo: { data: 1, hora: 2, min: 3 },
  },

  // === FORMATOS GENÉRICOS (capturam mais variações do Mural) ===
  {
    nome: 'audiência em + data (genérico)',
    regex: /audi[ência]+\s+.*?(?:em|para|dia)\s+(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data: 1 },
  },
  {
    nome: 'designada + data (genérico)',
    regex: /designad[oa]?\s+.*?(?:dia|data)\s+(\d{2}\/\d{2}\/\d{4})/i,
    grupo: { data: 1 },
  },

  // === FORMATO "DD de mês de AAAA" (comum em pautas do Mural) ===
  {
    nome: 'pauta de julgamento virtual (período)',
    regex: /pauta\s+de\s+julgamento.*?abertura.*?dia\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}).*?encerramento.*?dia\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
    grupo: { data_inicio: '1+2+3', data_fim: '4+5+6' },
  },
  {
    nome: 'sessão virtual com período',
    regex: /sess[ãa]o\s+virtual.*?abertura.*?dia\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}).*?encerramento.*?dia\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
    grupo: { data_inicio: '1+2+3', data_fim: '4+5+6' },
  },
  {
    nome: 'audiência em DD de mês (genérico)',
    regex: /audi[ência]+.*?(?:em|para|dia)\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
    grupo: { data: '1+2+3' },
  },
  {
    nome: 'designada em DD de mês (genérico)',
    regex: /designad[oa]?.*?(?:dia|data)\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
    grupo: { data: '1+2+3' },
  },
];

// Link de videoconferência (Zoom/Google Meet/Teams) embutido no texto da
// comunicação — achado revisando dados reais, 24/07/2026: 152 comunicações
// do Mural têm um link de sala de audiência em texto puro que não ia pra
// nenhum campo estruturado (ficava perdido dentro do texto bruto). Exclui
// de propósito páginas genéricas como "zoom.us/download" (não é link de
// sala) — só aceita o formato de link de entrada de reunião de cada
// plataforma.
export const REGEX_LINK_VIDEOCONFERENCIA = [
  /https?:\/\/[a-z0-9.-]*zoom\.us\/j\/\d+[^\s"'<]*/i,
  /https?:\/\/meet\.google\.com\/[a-z0-9-]+/i,
  /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<]+/i,
];

export function extrairLinkVideoconferencia(texto: string): string | null {
  const limpo = stripHtml(texto);
  for (const re of REGEX_LINK_VIDEOCONFERENCIA) {
    const m = limpo.match(re);
    if (m) return m[0].replace(/[.,;)\]]+$/, ""); // remove pontuação de frase colada no fim
  }
  return null;
}

export const REGEX_VALOR = [
  /[Vv]alor\s+da\s+Causa:?\s+R\$\s*([\d.,]+)/,
  /valor\s+atribu[íi]do\s+[àa]\s+causa:?\s+R\$\s*([\d.,]+)/i,
  // Achados revisando dados reais (24/07/2026) — mesmo conceito (valor da
  // causa), fraseado diferente. Âncora em "à causa" evita confundir com
  // outros valores do mesmo texto (valor da condenação, valor bloqueado
  // etc.), que são conceitos diferentes e não devem virar "valor da causa".
  /atribui[uo]\s+[àa]\s+causa\s+o\s+valor\s+de\s+R\$\s*([\d.,]+)/i,
  /valor\s+atribu[íi]do\s+[àa]\s+causa\s+de\s+R\$\s*([\d.,]+)/i,
];

type AudienciaExtraida = {
  regex_usado: string;
  [key: string]: string;
};

const MESES_PT: Record<string, string> = {
  janeiro: "01", fevereiro: "02", março: "03", marco: "03",
  abril: "04", maio: "05", junho: "06", julho: "07",
  agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

/** Converte "DD de mês de AAAA" para ISO (YYYY-MM-DD). */
export function converterDataPtParaIso(dia: string, mes: string, ano: string): string | null {
  const mesNum = MESES_PT[mes.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!mesNum) return null;
  return `${ano}-${mesNum}-${dia.padStart(2, "0")}`;
}

export function extrairAudienciaV2(texto: string): AudienciaExtraida | null {
  if (!texto) return null;
  // Limpa HTML antes de buscar — textos do Mural vêm em HTML puro
  const limpo = stripHtml(texto);
  for (const p of REGEX_AUDIENCIA_V2) {
    const m = limpo.match(p.regex);
    if (m) {
      const result: AudienciaExtraida = { regex_usado: p.nome };
      for (const [key, idx] of Object.entries(p.grupo)) {
        if (typeof idx === "number" && m[idx]) result[key] = m[idx].trim();
        if (typeof idx === "string" && idx.includes("+")) {
          // Formato composto: "1+2+3" = grupo 1 + grupo 2 + grupo 3
          const partes = idx.split("+").map((i) => m[parseInt(i)]?.trim()).filter(Boolean);
          result[key] = partes.join(" ");
        } else if (typeof idx === "string") {
          result[key] = idx;
        }
      }
      // Converte data pro formato ISO
      if (result.data) {
        if (result.data.includes("/")) {
          // Formato DD/MM/AAAA
          const [d, mo, a] = result.data.split("/");
          result.data_iso = `${a}-${mo}-${d}`;
        } else if (result.data.includes(" de ")) {
          // Formato "DD de mês de AAAA"
          const partes = result.data.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/);
          if (partes) {
            result.data_iso = converterDataPtParaIso(partes[1], partes[2], partes[3]) ?? result.data;
          }
        }
      }
      return result;
    }
  }
  return null;
}

export function extrairPrazoDias(texto: string): number | null {
  // Limpa HTML antes de buscar — textos do Mural vêm em HTML puro
  const limpo = stripHtml(texto);
  for (const re of REGEX_PRAZO_DIAS) {
    const m = limpo.match(re);
    if (m) return parseInt(m[1]);
  }
  // Nenhum dígito no texto ("em cinco dias", "prazo de quinze dias") —
  // achado revisando dados reais, 24/07/2026.
  return extrairPrazoDiasExtenso(limpo);
}

export function extrairPrazoHoras(texto: string): number | null {
  // Limpa HTML antes de buscar — textos do Mural vêm em HTML puro
  const limpo = stripHtml(texto);
  for (const re of REGEX_PRAZO_HORAS) {
    const m = limpo.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

export function extrairValor(texto: string): string | null {
  // Limpa HTML antes de buscar — textos do Mural vêm em HTML puro
  const limpo = stripHtml(texto);
  for (const re of REGEX_VALOR) {
    const m = limpo.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Converte valores monetários brasileiros capturados no texto para número. */
export function converterValorMonetario(valor: string | null): number | null {
  if (!valor) return null;

  const limpo = valor.replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(limpo)) return null;

  // Em documentos brasileiros, o último separador costuma ser o decimal.
  // Assim, 16.047,64 vira 16047.64 e 16.047 vira 16047.
  const ultimoPonto = limpo.lastIndexOf(".");
  const ultimaVirgula = limpo.lastIndexOf(",");
  let normalizado = limpo;

  if (ultimaVirgula >= 0) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto >= 0 && limpo.length - ultimoPonto - 1 === 2) {
    const partes = limpo.split(".");
    normalizado = `${partes.slice(0, -1).join("")}.${partes.at(-1)}`;
  } else {
    normalizado = limpo.replace(/\./g, "");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function extrairValorNumerico(texto: string): number | null {
  return converterValorMonetario(extrairValor(texto));
}
