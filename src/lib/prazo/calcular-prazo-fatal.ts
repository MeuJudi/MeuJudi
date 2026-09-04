// Calcula a data fatal de um prazo em dias úteis, pulando fim de semana,
// feriados nacionais (fixos e móveis) e o recesso forense. Usado pelos
// pollers de DataJud/Mural (Sprint 2) pra popular
// processos.prazo_proxima_resposta e criar o evento de agenda.
//
// [corrigido 01/09/2026] Duas lacunas reais achadas numa auditoria pedida
// pelo Caio (datas de prazo não batendo com a realidade):
// 1. Recesso forense (20/dez a 20/jan, CPC art. 220 + Resolução CNJ
//    244/2016) suspende a contagem de prazo processual inteiro — antes,
//    esses dias contavam normalmente como dias úteis.
// 2. Só feriados de DATA FIXA estavam cobertos. Carnaval, Sexta-feira
//    Santa e Corpus Christi são móveis (dependem da Páscoa) e quase
//    sempre são feriado forense — nenhum dos três entrava no cálculo.

const FERIADOS_NACIONAIS_MMDD = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

/** Domingo de Páscoa do ano — algoritmo de Gauss/Meeus (base de todo feriado móvel). */
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function somarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function paraChaveIso(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

const cacheFeriadosMoveisPorAno = new Map<number, Set<string>>();

/** Carnaval (segunda + terça), Sexta-feira Santa e Corpus Christi do ano — todos calculados a partir da Páscoa, e memorizados por ano pra não recalcular Gauss/Meeus a cada dia do loop. */
function feriadosMoveisDoAno(ano: number): Set<string> {
  const cache = cacheFeriadosMoveisPorAno.get(ano);
  if (cache) return cache;
  const pascoa = calcularPascoa(ano);
  const chaves = new Set([
    paraChaveIso(somarDias(pascoa, -48)), // Carnaval (segunda-feira)
    paraChaveIso(somarDias(pascoa, -47)), // Carnaval (terça-feira)
    paraChaveIso(somarDias(pascoa, -2)), // Sexta-feira Santa
    paraChaveIso(somarDias(pascoa, 60)), // Corpus Christi
  ]);
  cacheFeriadosMoveisPorAno.set(ano, chaves);
  return chaves;
}

/** Recesso forense: CPC art. 220 + Resolução CNJ 244/2016 — suspende prazo processual inteiro entre 20/dez e 20/jan, inclusive. */
function estaEmRecessoForense(data: Date): boolean {
  const mes = data.getMonth() + 1;
  const dia = data.getDate();
  return (mes === 12 && dia >= 20) || (mes === 1 && dia <= 20);
}

function ehDiaUtil(data: Date): boolean {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  if (estaEmRecessoForense(data)) return false;
  const mmdd = `${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  if (FERIADOS_NACIONAIS_MMDD.includes(mmdd)) return false;
  if (feriadosMoveisDoAno(data.getFullYear()).has(paraChaveIso(data))) return false;
  return true;
}

export function calcularPrazoFatal(dataInicio: Date, diasUteis: number): string {
  const data = new Date(dataInicio);
  let diasAdicionados = 0;

  while (diasAdicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    if (ehDiaUtil(data)) diasAdicionados++;
  }

  return data.toISOString().split("T")[0];
}
