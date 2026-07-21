/**
 * Validação e consulta de dados na OAB via Web Service oficial
 * Endpoint: https://www5.oab.org.br/cnaws/service.asmx
 *
 * Métodos SOAP/XML:
 * - ConsultaAdvogado(inscricao, uf, nome) — Retorna dados do advogado
 * - BuscaImagemAdvogado(numeroSeguranca) — Retorna foto
 *
 * Esse helper cacheia resultados por 7 dias no Supabase.
 */

import { createClient } from "@/lib/supabase/server";

export type OabAdvogado = {
  nome: string;
  inscricao: string;
  uf: string;
  situacao: string;
  tipo: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  cpf?: string;
};

const OABS_WS_URL = "https://www5.oab.org.br/cnaws/service.asmx";

function buildSoapEnvelope(inscricao: string, uf: string, nome: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ConsultaAdvogado xmlns="http://tempuri.org/">
      <inscricao>${inscricao}</inscricao>
      <uf>${uf}</uf>
      <nome>${nome}</nome>
    </ConsultaAdvogado>
  </soap:Body>
</soap:Envelope>`;
}

function extractFromXml(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function parseSoapResponse(xml: string): OabAdvogado | null {
  const nome = extractFromXml(xml, "NOME");
  const inscricao = extractFromXml(xml, "INSCRICAO");
  const uf = extractFromXml(xml, "UF");
  const situacao = extractFromXml(xml, "SITUACAO");
  const tipo = extractFromXml(xml, "TIPO");
  const endereco = extractFromXml(xml, "ENDERECO");
  const cidade = extractFromXml(xml, "CIDADE");
  const estado = extractFromXml(xml, "ESTADO");
  const cep = extractFromXml(xml, "CEP");
  const telefone = extractFromXml(xml, "TELEFONE");
  const email = extractFromXml(xml, "EMAIL");
  const cpf = extractFromXml(xml, "CPF");

  if (!nome && !inscricao) {
    return null;
  }

  return {
    nome: nome ?? "",
    inscricao: inscricao ?? "",
    uf: uf ?? "",
    situacao: situacao ?? "DESCONHECIDA",
    tipo: tipo ?? "",
    endereco: endereco ?? undefined,
    cidade: cidade ?? undefined,
    estado: estado ?? undefined,
    cep: cep ?? undefined,
    telefone: telefone ?? undefined,
    email: email ?? undefined,
    cpf: cpf ?? undefined,
  };
}

export async function consultarOab(inscricao: string, uf: string): Promise<OabAdvogado | null> {
  const numero = inscricao.replace(/\D/g, "");
  const estado = uf.toUpperCase();

  if (!numero || !estado) {
    throw new Error("Número da OAB e UF são obrigatórios.");
  }

  // Tenta cache primeiro (válido por 7 dias)
  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("oab_validations_cache")
    .select("*")
    .eq("oab_number", numero)
    .eq("oab_uf", estado)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return {
      nome: cached.nome ?? "",
      inscricao: cached.oab_number,
      uf: cached.oab_uf,
      situacao: cached.situacao ?? "DESCONHECIDA",
      tipo: cached.tipo_inscricao ?? "",
      endereco: cached.endereco ?? undefined,
      cidade: cached.cidade ?? undefined,
      estado: cached.estado ?? undefined,
      cep: cached.cep ?? undefined,
      telefone: cached.telefone ?? undefined,
      email: cached.email ?? undefined,
    };
  }

  // Consulta o Web Service oficial
  const envelope = buildSoapEnvelope(numero, estado, "");

  try {
    const response = await fetch(OABS_WS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://tempuri.org/ConsultaAdvogado",
      },
      body: envelope,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`OAB retornou status ${response.status}`);
    }

    const xml = await response.text();
    const parsed = parseSoapResponse(xml);

    // Salva no cache (inclusive quando não encontra)
    await supabase
      .from("oab_validations_cache")
      .upsert(
        {
          oab_number: numero,
          oab_uf: estado,
          nome: parsed?.nome ?? null,
          situacao: parsed?.situacao ?? "NAO_ENCONTRADO",
          tipo_inscricao: parsed?.tipo ?? null,
          endereco: parsed?.endereco ?? null,
          cidade: parsed?.cidade ?? null,
          estado: parsed?.estado ?? null,
          cep: parsed?.cep ?? null,
          telefone: parsed?.telefone ?? null,
          email: parsed?.email ?? null,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "oab_number,oab_uf" }
      );

    return parsed;
  } catch (err) {
    console.error("[OAB] Falha ao consultar Web Service oficial:", err);
    throw new Error(
      "Não foi possível validar a OAB agora. Tente novamente em alguns instantes."
    );
  }
}

export async function registrarStatusOab(
  userId: string,
  inscricao: string,
  uf: string,
  dados: OabAdvogado
) {
  const supabase = await createClient();
  const numero = inscricao.replace(/\D/g, "");
  const estado = uf.toUpperCase();

  const valido = dados.situacao
    ? /ATIV|REGULAR|REGULARMENTE|INSCRITO/i.test(dados.situacao)
    : false;

  await supabase.from("user_oab_status").upsert(
    {
      user_id: userId,
      oab_number: numero,
      oab_uf: estado,
      nome_oficial: dados.nome,
      situacao: dados.situacao,
      tipo_inscricao: dados.tipo,
      ultima_validacao: new Date().toISOString(),
      valido,
    },
    { onConflict: "user_id" }
  );
}
