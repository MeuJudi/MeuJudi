// src/lib/regex/patterns.ts
// Regex V2: extrai tipo + data + horário + sala + plataforma
// Versão testada e validada (6/9 audiências detectadas, 4 com horário)

export const REGEX_PRAZO_DIAS = [
  /Prazo:?\s+(\d+)\s+dias?/i,
  /em\s+(\d+)\s+dias(?!\s+[úu]teis)/i,
  /prazo\s+de\s+(\d+)\s+dias/i,
  /prazo\s+de\s+(\d+)\s+\(\w+\)\s+dias/i,
  /intime-se.*?em\s+(\d+)\s+dias/i,
  /manifeste-se.*?em\s+(\d+)\s+dias/i,
  /(\d+)\s+dias?\s+úteis/i,
];

export const REGEX_PRAZO_HORAS = [
  /em\s+(\d+)\s+horas?/i,
  /prazo\s+de\s+(\d+)h\b/i,
  /(\d+)h\s+(?:úteis|corridas?)/i,
];

export const REGEX_AUDIENCIA_V2 = [
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
    regex: /audiência\s+(?:de\s+instrução|de\s+conciliação|una|de\s+encerramento\s+de\s+instrução|inicial)?\s*designada\s+para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})/i,
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
];

export const REGEX_VALOR = [
  /[Vv]alor\s+da\s+Causa:?\s+R\$\s*([\d.,]+)/,
  /valor\s+atribu[íi]do\s+[àa]\s+causa:?\s+R\$\s*([\d.,]+)/i,
];

type AudienciaExtraida = {
  regex_usado: string;
  [key: string]: string;
};

export function extrairAudienciaV2(texto: string): AudienciaExtraida | null {
  if (!texto) return null;
  for (const p of REGEX_AUDIENCIA_V2) {
    const m = texto.match(p.regex);
    if (m) {
      const result: AudienciaExtraida = { regex_usado: p.nome };
      for (const [key, idx] of Object.entries(p.grupo)) {
        if (typeof idx === "number" && m[idx]) result[key] = m[idx].trim();
        if (typeof idx === "string") result[key] = idx;
      }
      // Converte data pro formato ISO
      if (result.data) {
        const [d, mo, a] = result.data.split('/');
        result.data_iso = `${a}-${mo}-${d}`;
      }
      return result;
    }
  }
  return null;
}

export function extrairPrazoDias(texto: string): number | null {
  for (const re of REGEX_PRAZO_DIAS) {
    const m = texto.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

export function extrairPrazoHoras(texto: string): number | null {
  for (const re of REGEX_PRAZO_HORAS) {
    const m = texto.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

export function extrairValor(texto: string): string | null {
  for (const re of REGEX_VALOR) {
    const m = texto.match(re);
    if (m) return m[1];
  }
  return null;
}
