// Tipos compartilhados da comunicação do Mural Eletrônico (API pública do
// PJe/CNJ). O cliente HTTP que buscava aqui direto da Vercel foi removido
// em 24/07/2026 — o Mural bloqueia consulta vinda de datacenter (HTTP 403),
// então a busca de verdade só acontece pelo MeuJudi Sync (rodando no
// computador do escritório), que devolve o resultado pra
// `/api/cs/sync/mural` no formato `MuralComunicacao` abaixo. Ver
// `src/app/api/cron/solicitar-mural/route.ts` (cria os pedidos que o CS
// consome) e `meujudi-cs/src/main/mural-client.ts` (o cliente HTTP de
// verdade, que roda do lado do CS).

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
    principal?: boolean;
    is_principal?: boolean;
    representante_principal?: boolean;
    tipo?: string;
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
  // Campos confirmados via chamada real à API (31/07/2026) — vinham na
  // resposta mas nunca eram lidos, ver migração
  // 20260731190000_mural_tipo_documento_cancelamento_orgao.sql.
  tipoDocumento?: string;
  ativo?: boolean;
  status?: string;
  data_cancelamento?: string | null;
  motivo_cancelamento?: string | null;
  idOrgao?: number;
}

