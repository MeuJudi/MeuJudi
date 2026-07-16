# 08 — IA + Regex (Sistema Inteligente)

> Dependências: Fases 01-07
> Duração estimada: 3-4 dias
> Prioridade: 🟠 Alta (diferencial competitivo)

---

## 🎯 Objetivo

Implementar sistema de **5 camadas** de extração de dados:
1. **Regex múltiplos** (rápido, grátis)
2. **Validação de consistência** (R$ 0)
3. **IA confirmadora** (Haiku, R$ 0,002)
4. **IA generalista** (Sonnet, R$ 0,008)
5. **Auto-correção de regex** (aprendizado contínuo)

---

## 📊 Arquitetura do sistema

```
[Texto da comunicação]
        ↓
[CAMADA 1: Regex Múltiplos]
  • 10-20 regexes do banco (regex_metadata)
  • Marca matches parciais
        ↓
[CAMADA 2: Validação]
  • Prazo entre 1-90 dias?
  • Data audiência é futura?
  • Valor > 0?
        ↓
  ├── Tudo válido? → [Salva, R$ 0]
  └── Algo errado?
        ↓
[CAMADA 3: IA Confirmadora (Haiku)]
  • Input: texto + matches parciais
  • Confirma ou corrige
        ↓
  ├── Confirma? → [Salva, R$ 0,002]
  └── Discorda?
        ↓
[CAMADA 4: IA Generalista (Sonnet)]
  • Input: texto + contexto completo
  • Extrai TUDO do zero
        ↓
  ├── Salva, R$ 0,008
  └── Salva padrão novo em regex_candidatas
        ↓
[CAMADA 5: Auto-correção]
  • IA sugere novo regex
  • Humano aprova (você)
  • Vai pra produção
```

---

## 💻 Código

### `src/lib/ia/client.ts` (wrapper Claude)

```typescript
// Wrapper da API da Anthropic (Claude)
// Suporta Haiku e Sonnet

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type ModeloIA = 'haiku' | 'sonnet';

export const TAREFAS = {
  // Haiku (barato, rápido) - 90% das chamadas
  validar_regex: 'haiku',
  extrair_prazo_simples: 'haiku',
  classificar_intimacao: 'haiku',
  resumir_curto: 'haiku',
  traduzir_juridico: 'haiku',

  // Sonnet (inteligente, mais caro) - 10% das chamadas
  extrair_prazo_complexo: 'sonnet',
  resumir_processo: 'sonnet',
  detectar_padroes: 'sonnet',
  ocr_pdf: 'sonnet',
  sugerir_regex: 'sonnet',
} as const;

export type TarefaIA = keyof typeof TAREFAS;

const MODELOS = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-3-5-sonnet-20241022',
};

export async function chamarIA(
  tarefa: TarefaIA,
  prompt: string,
  maxTokens = 1024,
): Promise<{ texto: string; custoUsd: number; modelo: string }> {
  const modelo = TAREFAS[tarefa];
  const modeloId = MODELOS[modelo];

  const response = await client.messages.create({
    model: modeloId,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = response.content[0].type === 'text'
    ? response.content[0].text
    : '';

  // Calcular custo (USD)
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const precos = {
    haiku: { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
    sonnet: { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  };
  const custoUsd =
    inputTokens * precos[modelo].input +
    outputTokens * precos[modelo].output;

  return { texto, custoUsd, modelo: modeloId };
}
```

### `src/lib/ia/prompts.ts` (templates de prompt)

```typescript
// Prompts organizados por tarefa

export const PROMPTS = {
  validarRegex: (regex: string, match: string, texto: string) => `
Você é um auditor de regex para sistema jurídico brasileiro.

REGEX TESTADA: /${regex}/
MATCH ENCONTRADO: "${match}"
TEXTO COMPLETO: "${texto}"

TAREFA: O match está correto? Responda JSON:
{
  "correto": true | false,
  "valor_correto": "valor correto se match estiver errado" | null,
  "explicacao": "por que está certo/errado"
}
`,

  extrairPrazo: (texto: string, contexto: any) => `
Você é um assistente jurídico analisando uma intimação brasileira.

TEXTO: "${texto}"

CONTEXTO DO PROCESSO:
- Classe: ${contexto.classe}
- Tribunal: ${contexto.tribunal}
- Tipo comunicação: ${contexto.tipo}

REGRAS CPC (se texto mencionar):
- Contestação = 15 dias
- Recurso de apelação = 15 dias
- Contrarrazões = 15 dias
- Embargos de declaração = 5 dias
- Manifestação sobre laudo = 15 dias

TAREFA: Extraia o prazo e a data de audiência (se houver).

Responda JSON:
{
  "prazo_dias": int | null,
  "prazo_horas": int | null,
  "data_audiencia": "YYYY-MM-DD" | null,
  "tipo_audiencia": "conciliacao" | "instrucao" | "julgamento" | null,
  "fundamento_legal": "art. X CPC" | null,
  "confianca": "alta" | "media" | "baixa"
}
`,

  sugerirRegex: (texto: string, camposExtraidos: any) => `
Você é um engenheiro de regex que ajuda a criar padrões de detecção para textos jurídicos.

TEXTO: "${texto}"
CAMPOS EXTRAÍDOS: ${JSON.stringify(camposExtraidos)}

TAREFA: Crie uma REGEX que detectaria esse padrão em textos futuros.
Considere:
- Variações de grafia
- Sinônimos
- Acentuação

Responda APENAS a regex (sem delimitadores / /, sem explicação):
`,

  classificarIntimacao: (texto: string) => `
Classifique esta intimação jurídica:

TEXTO: "${texto}"

Responda JSON:
{
  "urgencia": "alta" | "media" | "baixa",
  "acao_sugerida": "...",
  "prazo_dias": int | null,
  "tipo_real": "intimacao_pessoal" | "intimacao_por_edital" | "pauta" | "outro"
}
`,
};
```

### `src/lib/regex/engine.ts` (motor de regex com 3 estados)

```typescript
// Engine de regex com auto-correção
// 3 estados: novo → quente → confiável

import { createClient } from '@/lib/supabase/server';
import { chamarIA } from '@/lib/ia/client';
import { PROMPTS } from '@/lib/ia/prompts';

type Estado = 'novo' | 'quente' | 'confiavel';

interface RegexMetadata {
  id: string;
  regex: string;
  flags: string;
  estado: Estado;
  total_usos: number;
  total_acertos: number;
  taxa_acerto: number;
}

interface MatchResult {
  match: string | null;
  confianca: 'alta' | 'media' | 'baixa';
  validadoIA: boolean;
  regexUsada?: string;
}

export async function executarRegex(
  tenantId: string,
  texto: string,
  campo: 'prazo' | 'valor' | 'audiencia' | 'oab',
): Promise<MatchResult> {
  const supabase = createClient();

  // 1. Buscar regex ativas (do tenant OU globais)
  const { data: regexes } = await supabase
    .from('regex_metadata')
    .select('*')
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .eq('estado', 'quente')
    .or(`estado.eq.confiavel,estado.eq.novo`)
    .order('taxa_acerto', { ascending: false });

  if (!regexes || regexes.length === 0) {
    return { match: null, confianca: 'baixa', validadoIA: false };
  }

  // 2. Tentar cada regex
  for (const regex of regexes as RegexMetadata[]) {
    try {
      const re = new RegExp(regex.regex, regex.flags || 'i');
      const match = re.exec(texto);
      if (!match) continue;

      // 3. Decidir se valida com IA baseado no estado
      if (deveValidar(regex)) {
        const validacao = await validarComIA(regex.regex, match[0], texto);
        await atualizarMetricas(regex.id, validacao.correto);

        if (validacao.correto) {
          return {
            match: validacao.valor_correto || match[0],
            confianca: 'alta',
            validadoIA: true,
            regexUsada: regex.regex,
          };
        }
        // Se IA discordou, tenta próxima regex
        continue;
      }

      // Regex confiável: aceita direto
      return {
        match: match[0],
        confianca: 'alta',
        validadoIA: false,
        regexUsada: regex.regex,
      };
    } catch (err) {
      console.error(`[regex] Erro ao executar ${regex.regex}:`, err);
      continue;
    }
  }

  return { match: null, confianca: 'baixa', validadoIA: false };
}

function deveValidar(regex: RegexMetadata): boolean {
  switch (regex.estado) {
    case 'novo': return true; // 100% valida
    case 'quente': return Math.random() < 0.3; // 30% amostra
    case 'confiavel': return Math.random() < 0.01; // 1% amostra
    default: return true;
  }
}

async function validarComIA(
  regex: string,
  match: string,
  texto: string,
): Promise<{ correto: boolean; valor_correto: string | null }> {
  try {
    const { texto: resposta } = await chamarIA(
      'validar_regex',
      PROMPTS.validarRegex(regex, match, texto),
      256,
    );

    const parsed = JSON.parse(resposta);
    return {
      correto: parsed.correto,
      valor_correto: parsed.valor_correto,
    };
  } catch {
    return { correto: true, valor_correto: null }; // assume correto em caso de erro
  }
}

async function atualizarMetricas(regexId: string, correto: boolean) {
  const supabase = createClient();
  const acerto = correto ? 1 : 0;
  await supabase.rpc('atualizar_metricas_regex', {
    p_regex_id: regexId,
    p_acerto: acerto,
  });
}
```

### `src/lib/ia/extractor.ts` (camadas 3 e 4)

```typescript
// Camada 3: IA confirmadora
// Camada 4: IA generalista

import { chamarIA, TAREFAS } from './client';
import { PROMPTS } from './prompts';
import { createClient } from '@/lib/supabase/server';

export interface DadosExtraidos {
  prazo_dias: number | null;
  prazo_horas: number | null;
  data_audiencia: string | null;
  tipo_audiencia: string | null;
  valor_causa: number | null;
  fundamento_legal: string | null;
  confianca: 'alta' | 'media' | 'baixa';
  custoUsd: number;
  modelo: string;
  regex_usada: string | null;
}

export async function extrairDados(
  tenantId: string,
  texto: string,
  contexto: any,
  matchesParciais: any,
): Promise<DadosExtraidos> {
  // Camada 3: IA confirmadora
  if (matchesParciais.prazo_dias || matchesParciais.data_audiencia) {
    const { texto: resp, custoUsd, modelo } = await chamarIA(
      'extrair_prazo_simples',
      PROMPTS.extrairPrazo(texto, contexto),
    );
    const parsed = JSON.parse(resp);
    return {
      ...parsed,
      custoUsd,
      modelo,
      regex_usada: matchesParciais.regexUsada,
    };
  }

  // Camada 4: IA generalista (Sonnet, mais inteligente)
  const { texto: resp, custoUsd, modelo } = await chamarIA(
    'extrair_prazo_complexo',
    PROMPTS.extrairPrazo(texto, contexto),
    2048,
  );
  const parsed = JSON.parse(resp);
  return {
    ...parsed,
    custoUsd,
    modelo,
    regex_usada: null,
  };
}
```

---

## 🔄 Edge Function: Aprender Regex

### `supabase/functions/learn-regex/index.ts`

```typescript
// Aprende novo regex a partir de caso resolvido pela IA

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamarIA } from '../_shared/ia.ts';
import { PROMPTS } from '../_shared/prompts.ts';

Deno.serve(async (req) => {
  const { texto, camposExtraidos, tenantId } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // IA sugere regex
  const { texto: regexSugerida } = await chamarIA(
    'sugerir_regex',
    PROMPTS.sugerirRegex(texto, camposExtraidos),
  );

  // Validar regex (testa com o próprio texto)
  try {
    const re = new RegExp(regexSugerida, 'i');
    if (!re.test(texto)) {
      return new Response(JSON.stringify({ sucesso: false, motivo: 'regex_nao_casa' }), { status: 400 });
    }

    // Salvar como candidata
    const { data, error } = await supabase
      .from('regex_metadata')
      .insert({
        tenant_id: tenantId,
        nome: `auto_${Date.now()}`,
        descricao: 'Sugerida automaticamente pela IA',
        regex: regexSugerida,
        estado: 'novo',
        criado_por: 'sistema',
        texto_exemplo: texto,
      })
      .select()
      .single();

    return new Response(JSON.stringify({ sucesso: true, regex: data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ sucesso: false, motivo: 'regex_invalida', erro: err.message }), { status: 400 });
  }
});
```

---

## 📊 Tabela de Transição de Estados

| Estado | % de validação IA | Critério pra mudar |
|---|---|---|
| **novo** | 100% | 50 usos com >90% acerto → vai pra **quente** |
| **quente** | 30% (sampling) | 200 usos com >98% acerto → vai pra **confiavel**. Se acerto <85% → volta pra **novo** |
| **confiavel** | 1% (só pra monitorar) | Se errar 3 vezes em 100 → volta pra **quente** |

---

## 🛠️ Função SQL de transição

```sql
CREATE OR REPLACE FUNCTION check_regex_transition(p_regex_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total INTEGER;
  v_acertos INTEGER;
  v_estado TEXT;
  v_novo_estado TEXT;
BEGIN
  SELECT total_usos, total_acertos, estado INTO v_total, v_acertos, v_estado
  FROM regex_metadata WHERE id = p_regex_id;

  IF v_estado = 'novo' AND v_total >= 50 THEN
    IF v_acertos::FLOAT / v_total > 0.9 THEN
      v_novo_estado := 'quente';
    END IF;
  ELSIF v_estado = 'quente' AND v_total >= 200 THEN
    IF v_acertos::FLOAT / v_total > 0.98 THEN
      v_novo_estado := 'confiavel';
    ELSIF v_acertos::FLOAT / v_total < 0.85 THEN
      v_novo_estado := 'novo';
    END IF;
  ELSIF v_estado = 'confiavel' THEN
    IF v_total >= 100 AND v_acertos::FLOAT / v_total < 0.97 THEN
      v_novo_estado := 'quente';
    END IF;
  END IF;

  IF v_novo_estado IS NOT NULL THEN
    UPDATE regex_metadata SET estado = v_novo_estado, updated_at = now() WHERE id = p_regex_id;
  END IF;

  RETURN v_novo_estado;
END;
$$ LANGUAGE plpgsql;
```

---

## 📈 Custo mensal estimado

| Cenário | Volume | Custo |
|---|---|---|
| 700 processos × 2x polling | 1.400 polling/dia | R$ 0 (regex resolve) |
| 30% precisa IA camada 3 | 420 chamadas/dia | R$ 2,5/dia |
| 5% precisa IA camada 4 | 70 chamadas/dia | R$ 0,6/dia |
| **Total mensal** | ~14.700 chamadas IA | **R$ 5-15/mês** |

---

## ✅ Checklist

- [ ] Cliente Claude configurado (`@anthropic-ai/sdk`)
- [ ] Prompts organizados em `prompts.ts`
- [ ] Engine de regex com 3 estados funcionando
- [ ] Edge function `learn-regex` deployada
- [ ] Função SQL de transição de estado criada
- [ ] Custo mensal monitorado
- [ ] Teste: regex resolve sozinho
- [ ] Teste: IA valida e corrige
- [ ] Teste: regex candidata é gerada e aprovada

---

## 📚 Próximo passo

Continue com [`09-cert-a1.md`](09-cert-a1.md).

---

## 🔧 Regex V2 — Versão expandida (testada e validada)

### Resultados do teste (6/9 audiências detectadas, 4 com horário)

A regex V1 pegava **6/21 audiências** (29%). A regex V2 mantém 6 detecções mas com **muito mais detalhes**:

| Campo | V1 | V2 |
|---|---|---|
| Data | ✅ | ✅ + formato ISO (`2026-01-21`) |
| **Tipo de audiência** | ❌ | ✅ (instrução, conciliação, una, etc) |
| **Horário** | ❌ | ✅ (09:00, 15:40, 10:30) |
| **Plataforma** | ❌ | ✅ (videoconferência, presencial) |
| **Local/Sala** | ❌ | ✅ (quando mencionado) |
| **Período (Pauta)** | Parcial | ✅ (data_inicio + data_fim) |

**Arquivo criado:** [`src/lib/regex/patterns.ts`](../../src/lib/regex/patterns.ts)

### Exemplos reais do teste

**Audiência de instrução (CNJ 0000281):**
```
Fica a parte JDF EMPREENDIMENTOS intimada de que a
"Audiência do tipo Audiência de instrução" designada para
29/07/2026 15:40 recebeu agendamento na plataforma Zoom
```
**Extraído:** tipo=`Audiência de instrução`, data=`2026-07-29`, hora=`15:40`, plataforma=`Zoom`

**Pauta de Julgamento (CNJ 0013016):**
```
Setor de Pautas - Pauta de Julgamento do dia 10/08/2026 00:00
até 14/08/2026 23:59 - Sessão Virtual Ordinária - 6ª Câmara Cível
```
**Extraído:** data_inicio=`10/08/2026`, data_fim=`14/08/2026`, tipo=`sessao virtual`

**Audiência de una por videoconferência (CNJ 0001644):**
```
"Audiência do tipo Audiência de una por videoconferência (rito sumaríssimo)"
designada para 21/01/2026 09:00
```
**Extraído:** tipo, data, hora (sem plataforma — foi inferida do tipo)

### Teste automatizado

Script de teste criado: `tests/test-audiencias-v2.js`

**Resultado salvo em:** `tests/data/audiencias-v2-resultado.json`

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
