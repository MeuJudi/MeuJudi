// Mapeia um CNJ pro(s) tribunal(is) candidato(s) no DataJud. Formato CNJ:
// NNNNNNN-DD.AAAA.J.TR.OOOO — o segmento (posição 13) indica a Justiça
// (5=trabalhista, 4=federal, 8=estadual...) e TR (posições 14-15) é o número
// do tribunal DENTRO daquele segmento — NÃO é o código IBGE da UF.
// Ex: 5.09 = TRT9 (não "UF 09"). 8.16 = TJPR (PR é 16 no segmento 8).
// Ver docs/roadmap/06-edge-datajud.md.

const TRT_CNJ: Record<string, string> = {
  "01": "trt1", "02": "trt2", "03": "trt3", "04": "trt4", "05": "trt5",
  "06": "trt6", "07": "trt7", "08": "trt8", "09": "trt9", "10": "trt10",
  "11": "trt11", "12": "trt12", "13": "trt13", "14": "trt14", "15": "trt15",
  "16": "trt16", "17": "trt17", "18": "trt18", "19": "trt19", "20": "trt20",
  "21": "trt21", "22": "trt22", "23": "trt23", "24": "trt24",
};

const TRF_CNJ: Record<string, string> = {
  "01": "trf1", "02": "trf2", "03": "trf3", "04": "trf4", "05": "trf5", "06": "trf6",
};

const TJ_CNJ: Record<string, string> = {
  "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam", "05": "tjba",
  "06": "tjce", "07": "tjdft", "08": "tjes", "09": "tjgo", "10": "tjma",
  "11": "tjmt", "12": "tjms", "13": "tjmg", "14": "tjpa", "15": "tjpb",
  "16": "tjpr", "17": "tjpe", "18": "tjpi", "19": "tjrj", "20": "tjrn",
  "21": "tjrs", "22": "tjro", "23": "tjrr", "24": "tjsc", "25": "tjsp",
  "26": "tjse", "27": "tjto",
};

const TRE_CNJ: Record<string, string> = {
  "01": "tre-ac", "02": "tre-al", "03": "tre-ap", "04": "tre-am", "05": "tre-ba",
  "06": "tre-ce", "07": "tre-dft", "08": "tre-es", "09": "tre-go", "10": "tre-ma",
  "11": "tre-mt", "12": "tre-ms", "13": "tre-mg", "14": "tre-pa", "15": "tre-pb",
  "16": "tre-pr", "17": "tre-pe", "18": "tre-pi", "19": "tre-rj", "20": "tre-rn",
  "21": "tre-rs", "22": "tre-ro", "23": "tre-rr", "24": "tre-sc", "25": "tre-sp",
  "26": "tre-se", "27": "tre-to",
};

const TJM_CNJ: Record<string, string> = {
  "13": "tjmmg", "21": "tjmrs", "25": "tjmsp",
};

const FALLBACK_TRIBUNAIS = ["tjpr", "trt9", "trf4", "tjsp", "tjrj"];

export function extrairTribunaisCandidatos(cnj: string): string[] {
  const limpo = cnj.replace(/\D/g, "").padStart(20, "0");
  const segmento = limpo[13];
  const tr = limpo[14] + limpo[15];

  switch (segmento) {
    case "5":
      return [TRT_CNJ[tr] ?? "trt2"];
    case "4":
      return [TRF_CNJ[tr] ?? "trf4"];
    case "8":
      return [TJ_CNJ[tr] ?? "tjpr"];
    case "1":
      return ["stf"];
    case "2":
      return ["stj"];
    case "3":
      return ["tst"];
    case "6":
      return [TRE_CNJ[tr] ?? "tre-pr"];
    case "7":
      return [TJM_CNJ[tr] ?? "tjmmg"];
    default:
      return FALLBACK_TRIBUNAIS;
  }
}
