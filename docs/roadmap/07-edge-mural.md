# 07 — Edge Function: Polling Mural Eletrônico

> Dependências: Fases 01-06
> Duração estimada: 2-3 dias
> Prioridade: 🟠 Alta

---

## 🎯 Objetivo

Criar Edge Function que roda **1x por semana** e busca comunicações do Mural Eletrônico por OAB de cada advogado, descobrindo processos novos automaticamente.

---

## 📊 Visão geral

```
[Supabase Cron: segunda 6h]
        ↓
[Edge Function: poll-mural]
        ↓
   Busca todas OABs ativas
        ↓
   Para cada OAB:
        ├── GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=X&ufOab=PR
        ├── Para cada comunicação (últimos 7 dias):
        │   ├── Se CNJ já existe: vincula ao processo
        │   ├── Se CNJ novo: cria processo
        │   ├── Salva destinatários + advogados
        │   ├── Extrai prazo (regex + IA)
        │   ├── Extrai audiência (regex + IA)
        │   └── Cria evento na agenda
        ├── Marca mural_id como processado
        └── Se houver novidades: notifica advogado
```

---

## 💻 Código

### `supabase/functions/poll-mural/mural.ts`

```typescript
// Cliente da API do Mural Eletrônico (CNJ)
// URL descoberta: https://comunicaapi.pje.jus.br/api/v1/comunicacao

const MURAL_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

export interface MuralComunicacao {
  id: number;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string;
  nomeOrgao: string;
  idOrgao: number;
  texto: string;
  numero_processo: string;
  meio: string;
  link: string;
  tipoDocumento: string;
  nomeClasse: string;
  codigoClasse: string;
  numeroComunicacao: number;
  ativo: boolean;
  hash: string;
  status: string;
  motivo_cancelamento: string | null;
  data_cancelamento: string | null;
  meiocompleto: string;
  numeroprocessocommascara: string;
  destinatarios: Array<{
    nome: string;
    comunicacao_id: number;
    polo: string;
  }>;
  destinatarioadvogados: Array<{
    id: number;
    comunicacao_id: number;
    advogado_id: number;
    advogado: {
      id: number;
      nome: string;
      numero_oab: string;
      uf_oab: string;
    };
  }>;
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
    params.set('numeroOab', oab);
    params.set('ufOab', uf);
    params.set('pagina', String(pagina));
    params.set('itensPorPagina', String(itensPorPagina));
    if (dataInicio) params.set('dataDisponibilizacaoInicio', dataInicio);
    if (dataFim) params.set('dataDisponibilizacaoFim', dataFim);

    const url = `${MURAL_BASE}?${params.toString()}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Mural HTTP ${response.status}`);
    }

    return await response.json();
  }

  async buscarPorCNJ(cnj: string): Promise<MuralResponse> {
    const cnjLimpo = cnj.replace(/\D/g, '');
    const url = `${MURAL_BASE}?numeroProcesso=${cnjLimpo}&itensPorPagina=10`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Mural HTTP ${response.status}`);
    }

    return await response.json();
  }
}
```

### `supabase/functions/poll-mural/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { MuralClient, MuralComunicacao } from './mural.ts';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const mural = new MuralClient();

  console.log('[poll-mural] Iniciado');

  try {
    // 1. Buscar todas OABs ativas
    const { data: oabs, error: oabsError } = await supabase
      .from('escritorio_oabs')
      .select(`
        id,
        tenant_id,
        oab_number,
        oab_uf,
        is_primary,
        escritorio:tenants!inner(is_active)
      `)
      .eq('is_active', true)
      .eq('escritorio.is_active', true);

    if (oabsError) throw oabsError;

    console.log(`[poll-mural] ${oabs.length} OABs ativas`);

    // 2. Calcular janela de busca (últimos 7 dias)
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7);
    const dataInicio = seteDiasAtras.toISOString().split('T')[0];
    const dataFim = hoje.toISOString().split('T')[0];

    const results = {
      oabsProcessadas: 0,
      comunicacoesNovas: 0,
      comunicacoesVinculadas: 0,
      erros: 0,
    };

    // 3. Para cada OAB, buscar comunicações
    for (const oab of oabs) {
      try {
        // Buscar comunicações da semana
        const response = await mural.buscarPorOAB(
          oab.oab_number,
          oab.oab_uf,
          dataInicio,
          dataFim,
        );

        if (!response.items || response.items.length === 0) {
          continue;
        }

        console.log(
          `[poll-mural] OAB ${oab.oab_number}/${oab.oab_uf}: ${response.items.length} comunicações`
        );

        // 4. Para cada comunicação, salvar ou vincular
        for (const com of response.items) {
          const saved = await processarComunicacao(supabase, mural, oab, com);
          if (saved) {
            results.comunicacoesNovas++;
          } else {
            results.comunicacoesVinculadas++;
          }
        }

        results.oabsProcessadas++;
      } catch (err) {
        console.error(`[poll-mural] Erro OAB ${oab.oab_number}:`, err.message);
        results.erros++;
      }

      // Pausa entre OABs (rate limit)
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log('[poll-mural] Finalizado', results);
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[poll-mural] Erro fatal:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});

async function processarComunicacao(
  supabase: any,
  mural: MuralClient,
  oab: any,
  com: MuralComunicacao,
): Promise<boolean> {
  // 1. Verificar se já existe
  const { data: existing } = await supabase
    .from('comunicacoes_mural')
    .select('id')
    .eq('mural_id', com.id)
    .single();

  if (existing) {
    return false; // já existe, vinculado
  }

  // 2. Buscar ou criar processo
  let processoId: string;

  const { data: processo } = await supabase
    .from('processos')
    .select('id')
    .eq('tenant_id', oab.tenant_id)
    .eq('cnj', com.numero_processo)
    .single();

  if (processo) {
    processoId = processo.id;
  } else {
    // Criar processo novo
    const { data: newProcesso, error: createError } = await supabase
      .from('processos')
      .insert({
        tenant_id: oab.tenant_id,
        cnj: com.numero_processo,
        tribunal: com.siglaTribunal.toLowerCase(),
        classe_codigo: parseInt(com.codigoClasse),
        classe_nome: com.nomeClasse,
        orgao_julgador: com.nomeOrgao,
        grau: com.siglaTribunal.toLowerCase() === 'tjpr' ? 'G1' : 'G1',
        is_favorito: false,
        status: 'ativo',
        ultima_sync_mural: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createError) {
      console.error(`[poll-mural] Erro criando processo ${com.numero_processo}:`, createError);
      return false;
    }
    processoId = newProcesso.id;
  }

  // 3. Extrair prazo e audiência do texto (regex básico por agora, IA depois)
  const { prazo_dias, data_audiencia, tipo_audiencia } = extrairDadosTexto(com.texto);

  // 4. Salvar comunicação
  const { error: insertError } = await supabase
    .from('comunicacoes_mural')
    .insert({
      tenant_id: oab.tenant_id,
      processo_id: processoId,
      mural_id: com.id,
      data_disponibilizacao: com.data_disponibilizacao,
      sigla_tribunal: com.siglaTribunal,
      tipo_comunicacao: com.tipoComunicacao,
      nome_orgao: com.nomeOrgao,
      texto: com.texto,
      meio: com.meio,
      link_processo: com.link,
      destinatarios: com.destinatarios,
      advogados: com.destinatarioadvogados.map((d) => ({
        nome: d.advogado.nome,
        oab: d.advogado.numero_oab,
        uf: d.advogado.uf_oab,
      })),
      prazo_dias,
      data_audiencia,
      tipo_audiencia,
      prazo_extraido_por: 'regex',
      prazo_confianca: prazo_dias ? 'alta' : 'media',
    });

  if (insertError) {
    console.error(`[poll-mural] Erro salvando comunicação ${com.id}:`, insertError);
    return false;
  }

  // 5. Atualizar processo com partes e advogados
  const autor = com.destinatarios.find((d) => d.polo === 'A');
  const reu = com.destinatarios.find((d) => d.polo === 'P');

  await supabase
    .from('processos')
    .update({
      autor: autor?.nome,
      reu: reu?.nome,
      advogados: com.destinatarioadvogados.map((d) => ({
        nome: d.advogado.nome,
        oab: d.advogado.numero_oab,
        uf: d.advogado.uf_oab,
      })),
      proxima_audiencia: data_audiencia,
      proxima_audiencia_tipo: tipo_audiencia,
      prazo_proxima_resposta: prazo_dias
        ? calcularPrazoFatal(new Date(com.data_disponibilizacao), prazo_dias)
        : null,
    })
    .eq('id', processoId);

  // 6. Criar evento na agenda
  if (data_audiencia) {
    await supabase.from('agenda_eventos').insert({
      tenant_id: oab.tenant_id,
      processo_id: processoId,
      user_id: null,
      tipo: 'audiencia',
      titulo: `${com.tipoComunicacao} - ${com.siglaTribunal}`,
      descricao: com.nomeOrgao,
      data_inicio: data_audiencia,
      fonte: 'mural',
      mural_id: com.id,
    });
  }

  if (prazo_dias) {
    const dataFatal = calcularPrazoFatal(new Date(com.data_disponibilizacao), prazo_dias);
    await supabase.from('agenda_eventos').insert({
      tenant_id: oab.tenant_id,
      processo_id: processoId,
      user_id: null,
      tipo: 'prazo',
      titulo: `Prazo: ${prazo_dias} dias`,
      descricao: com.tipoComunicacao,
      data_inicio: dataFatal,
      fonte: 'mural',
      mural_id: com.id,
    });
  }

  console.log(`[poll-mural] Nova comunicação: ${com.numero_processo}`);
  return true;
}

function extrairDadosTexto(texto: string): {
  prazo_dias: number | null;
  data_audiencia: string | null;
  tipo_audiencia: string | null;
} {
  let prazo_dias: number | null = null;
  let data_audiencia: string | null = null;
  let tipo_audiencia: string | null = null;

  // Prazo: "Prazo: 15 dias" ou "em 15 dias"
  const prazoMatch = texto.match(/Prazo:?\s+(\d+)\s+dias?|em\s+(\d+)\s+dias/i);
  if (prazoMatch) {
    prazo_dias = parseInt(prazoMatch[1] || prazoMatch[2]);
  }

  // Audiência: "audiência para 15/09/2026"
  const audMatch = texto.match(/audiência\s+(?:de\s+(\w+))?\s+(?:designada\s+)?para\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})/i);
  if (audMatch) {
    const [_, tipo, data] = audMatch;
    const [dia, mes, ano] = data.split('/');
    data_audiencia = `${ano}-${mes}-${dia}`;
    tipo_audiencia = tipo ? tipo.toLowerCase() : null;
  }

  return { prazo_dias, data_audiencia, tipo_audiencia };
}

function calcularPrazoFatal(dataInicio: Date, diasUteis: number): string {
  // Pula sábado, domingo e feriados nacionais básicos
  const feriados = ['01-01', '21-04', '01-05', '07-09', '12-10', '02-11', '15-11', '25-12'];

  let data = new Date(dataInicio);
  let diasAdicionados = 0;

  while (diasAdicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay();
    const mmdd = `${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

    if (diaSemana !== 0 && diaSemana !== 6 && !feriados.includes(mmdd)) {
      diasAdicionados++;
    }
  }

  return data.toISOString().split('T')[0];
}
```

---

## ⏰ Cron: 1x por semana (segunda 6h)

```sql
SELECT cron.schedule(
  'poll-mural-weekly',
  '0 6 * * 1', -- 6h toda segunda
  $$
  SELECT net.http_post(
    url := 'https://[SEU-PROJETO].supabase.co/functions/v1/poll-mural',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [SUPABASE_SERVICE_ROLE_KEY]'
    ),
    body := '{"manual": false}'::jsonb
  );
  $$
);
```

---

## 🧪 Teste manual

```bash
curl -X POST \
  'https://[SEU-PROJETO].supabase.co/functions/v1/poll-mural' \
  -H 'Authorization: Bearer [SUPABASE_SERVICE_ROLE_KEY]' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## ✅ Checklist

- [ ] Edge function `poll-mural` deployada
- [ ] Cron job semanal configurado
- [ ] Teste manual: 1 OAB retorna comunicações
- [ ] Processos novos sendo criados
- [ ] Partes e advogados sendo salvos
- [ ] Eventos na agenda criados
- [ ] Prazo sendo calculado corretamente

---

## 📚 Próximo passo

Continue com [`08-ia-regex.md`](08-ia-regex.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
