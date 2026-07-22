export type TipoMagistrado = "juiz" | "juiza" | "relator" | "desembargador" | "desembargadora" | "magistrado";

export interface MetadadosMural {
  orgaoJulgador: string | null;
  magistradoNome: string | null;
  magistradoTipo: TipoMagistrado | null;
}

function textoLegivel(texto: string) {
  return texto
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ");
}

function limparCampo(valor: string) {
  return valor.replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
}

/** Extrai somente campos com marcador explícito para evitar falsos positivos. */
export function extrairMetadadosMural(texto: string): MetadadosMural {
  const legivel = textoLegivel(texto);
  const orgao = legivel.match(/(?:^|\n)\s*(?:[oó]rg[aã]o\s+julgador|vara|ju[ií]zo)\s*:\s*([^\n]{3,180})/iu);
  const magistrado = legivel.match(/(?:^|\n)\s*(ju[ií]z(?:a)?|magistrad[oa]|relator(?:a)?|desembargador(?:a)?)\s*(?:de\s+direito)?\s*:\s*([^\n.;]{3,140})/iu);

  let magistradoTipo: TipoMagistrado | null = null;
  if (magistrado) {
    const marcador = magistrado[1].toLocaleLowerCase("pt-BR");
    if (marcador.includes("relator")) magistradoTipo = "relator";
    else if (marcador.includes("desembargadora")) magistradoTipo = "desembargadora";
    else if (marcador.includes("desembargador")) magistradoTipo = "desembargador";
    else if (marcador.includes("juíza") || marcador.includes("juiza")) magistradoTipo = "juiza";
    else if (marcador.includes("juiz")) magistradoTipo = "juiz";
    else magistradoTipo = "magistrado";
  }

  return {
    orgaoJulgador: orgao ? limparCampo(orgao[1]) : null,
    magistradoNome: magistrado ? limparCampo(magistrado[2]) : null,
    magistradoTipo,
  };
}
