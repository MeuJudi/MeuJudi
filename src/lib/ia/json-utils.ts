// Utilitário pra extrair JSON de respostas de LLM, que frequentemente vêm
// malformadas de jeitos previsíveis mesmo quando o prompt pede
// explicitamente "responda apenas com JSON":
//
// 1. Envolvidas em blocos de markdown (```json ... ```) — achado testando
//    a Camada 4 (Sonnet) com uma chamada real.
// 2. Com backslashes não escapados dentro de valores de string — achado
//    testando a Camada 3 (Haiku): ao descrever o regex na explicação, o
//    modelo escreveu `\s+(\d+)` literalmente em vez de `\\s+(\\d+)`, o que
//    não é um escape válido em JSON (`\s` não existe como sequência de
//    escape JSON) e quebra o parse mesmo com o resto do JSON correto.

const ESCAPES_JSON_VALIDOS = /\\(?!["\\/bfnrtu])/g;

/** Duplica backslashes que não fazem parte de um escape JSON válido. */
function repararEscapesInvalidos(texto: string): string {
  return texto.replace(ESCAPES_JSON_VALIDOS, "\\\\");
}

/**
 * Remove blocos de markdown e espaços nas pontas antes de tentar fazer
 * parse. Se não houver bloco de markdown, tenta extrair o trecho entre a
 * primeira `{` e a última `}` como fallback. Se o parse falhar por causa de
 * backslash mal escapado (erro comum de LLM), tenta reparar e faz parse de
 * novo antes de desistir.
 */
export function extrairJSON<T = unknown>(respostaBruta: string): T {
  let texto = respostaBruta.trim();

  const blocoMarkdown = texto.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (blocoMarkdown) {
    texto = blocoMarkdown[1].trim();
  } else {
    const primeiraChave = texto.indexOf("{");
    const ultimaChave = texto.lastIndexOf("}");
    if (primeiraChave !== -1 && ultimaChave !== -1 && ultimaChave > primeiraChave) {
      texto = texto.slice(primeiraChave, ultimaChave + 1);
    }
  }

  try {
    return JSON.parse(texto) as T;
  } catch (erroOriginal) {
    try {
      return JSON.parse(repararEscapesInvalidos(texto)) as T;
    } catch {
      // Preserva o erro original (mais informativo que o da tentativa de reparo)
      throw erroOriginal;
    }
  }
}
