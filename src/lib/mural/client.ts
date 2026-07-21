// Cliente do Mural Eletrônico (API pública do PJe/CNJ). Ao contrário do
// DataJud (1 chamada = 1 processo já conhecido), uma chamada aqui devolve
// uma LISTA de comunicações — é isso que permite descobrir processo novo por
// OAB. Não tem API key (endpoint público sem auth). Ver
// docs/roadmap/07-edge-mural.md.

const MURAL_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

export interface MuralDestinatario {
  nome: string;
  comunicacao_id: number;
  polo: "A" | "P" | string;
}

export interface MuralDestinatarioAdvogado {
  id: number;
  comunicacao_id: number;
  advogado_id: number;
  advogado: {
    id: number;
    nome: string;
    numero_oab: string;
    uf_oab: string;
  };
}

export interface MuralComunicacao {
  id: number;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string;
  nomeOrgao: string;
  texto: string;
  numero_processo: string;
  meio: string;
  link: string;
  nomeClasse: string;
  codigoClasse: string;
  destinatarios: MuralDestinatario[];
  destinatarioadvogados: MuralDestinatarioAdvogado[];
}

export interface MuralResponse {
  status: string;
  message: string;
  count: number;
  items: MuralComunicacao[];
}

export class MuralClient {
  async buscarPorOAB(
    oab: string,
    uf: string,
    dataInicio?: string,
    dataFim?: string,
    pagina = 1,
    itensPorPagina = 100,
  ): Promise<MuralResponse> {
    const params = new URLSearchParams();
    params.set("numeroOab", oab);
    params.set("ufOab", uf);
    params.set("pagina", String(pagina));
    params.set("itensPorPagina", String(itensPorPagina));
    if (dataInicio) params.set("dataDisponibilizacaoInicio", dataInicio);
    if (dataFim) params.set("dataDisponibilizacaoFim", dataFim);

    const url = `${MURAL_BASE}?${params.toString()}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Mural HTTP ${response.status}`);
    }

    return (await response.json()) as MuralResponse;
  }
}
