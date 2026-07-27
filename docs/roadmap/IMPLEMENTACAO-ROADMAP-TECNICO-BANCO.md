# Guia de Implementacao do Roadmap Tecnico do Banco

Este documento transforma o Roadmap Tecnico do Banco de Dados em um plano de implementacao executavel.

Objetivo: melhorar consistencia, rastreabilidade e cobertura sem perder os dados atuais nem confundir as fontes do MeuJudi:

- **DataJud:** consulta publica de um processo cujo CNJ ja e conhecido.
- **Mural:** descoberta de comunicacoes por OAB, normalmente sincronizadas pelo MeuJudi CS.
- **PJe/CS:** acesso privado ao painel do advogado, dependente de sessao, tribunal e certificado.

Um processo aparecer no banco nao prova que o CS consegue acessar o PJe daquele tribunal.

## 1. Compatibilidade com o sistema atual

As colunas atuais devem continuar existindo durante a transicao:

- `processos.tribunal`
- `processos.sistema`
- `processos.source_context`
- `processos.ultima_sync_datajud`
- `processos.ultima_sync_mural`
- `processos.ultima_sync_pje`
- `comunicacoes_mural.sigla_tribunal`

As novas colunas entram como opcionais. A obrigatoriedade so deve ser ativada depois do backfill e da validacao dos pollers.

### Sigla de exibicao e codigo de integracao

Nao usar a mesma representacao para exibicao e endpoint:

- exibicao: `TJPR`, `TRT9`, `TRF4`;
- codigo interno: `tjpr`, `trt9`, `trf4`;
- slug do DataJud: `tjpr`, `trt9`, `trf4`;
- sistema exibido: `EPROC`, `PJe`, `Projudi`, `SAJ`.

A interface fica padronizada sem quebrar URLs ou mapeamentos da API.

## 2. Fase 0: preparacao

### Inventario

Antes da migration, gerar um relatorio somente leitura com:

- total de processos;
- tribunais e sistemas distintos;
- quantidade de `NULL`;
- quantidade de `Inválido`;
- registros por tenant;
- registros por fonte;
- ultima sincronizacao de cada fonte.

Salvar o relatorio em `docs/roadmap/auditorias/`.

### Backup e rollback

1. Exportar as colunas originais de `processos` e `comunicacoes_mural`.
2. Criar uma tabela temporaria de backup com identificador da execucao.
3. Executar a normalizacao em transacao.
4. Conferir totais antes e depois.
5. Remover o backup somente depois da validacao em producao.

Nenhum processo deve ser excluido automaticamente.

### Migration

Criar uma migration versionada em `supabase/migrations/`, por exemplo:

`20260728xxxxxx_tribunais_sistemas_crawlers.sql`

A migration deve ser idempotente quando possivel e conter comentarios explicando as regras.

## 3. Fase 1: padronizacao dos dados

### Tribunais

Criar funcoes unicas:

```text
normalizarTribunalExibicao("tjpr") -> "TJPR"
normalizarTribunalCodigo("TJPR")  -> "tjpr"
```

Mapeamentos conhecidos:

- `TJPR`, `tjpr` -> `tjpr`;
- `TJRJ`, `tjrj` -> `tjrj`;
- `TRF4`, `trf4` -> `trf4`;
- `TRT9`, `trt9` -> `trt9`.

Valores desconhecidos devem gerar item de revisao, sem serem apagados.

### Sistemas

Usar dicionario controlado:

| Entrada | Valor canonico |
|---|---|
| `Eproc`, `EPROC`, `eproc` | `EPROC` |
| `PJe`, `PJE`, `Pje` | `PJe` |
| `Projudi`, `PROJUDI` | `Projudi` |
| `SAJ`, `e-SAJ`, `ESAJ` | `SAJ` |
| `Inválido`, vazio | `NULL` |

`NULL` significa “ainda nao identificado”, e nao “tribunal sem sistema”.

### Backfill

Durante o backfill:

- preencher `tribunal_id` quando houver correspondencia segura;
- preencher `sistema_id` somente quando o valor for conhecido;
- preservar o texto original;
- marcar registros antigos sem fonte como `legado_sem_rastreio`;
- identificar processos com tribunal `TESTE`.

## 4. Fase 2: tabelas de referencia

### `tribunais`

```text
id uuid primary key
codigo text unique not null       -- tjpr, trt9, trf4
sigla text unique not null        -- TJPR, TRT9, TRF4
nome text not null
segmento text not null            -- estadual, federal, trabalho etc.
sistema_principal_id uuid null
datajud_slug text null
url_publica text null
ativo boolean not null default true
observacoes text null
created_at timestamptz
updated_at timestamptz
```

Regras:

- `codigo` e usado pelas integracoes;
- `sigla` e usada na interface;
- `datajud_slug` e usado pelo cliente DataJud;
- um tribunal pode ter mais de um sistema;
- o sistema principal nao deve esconder sistemas secundarios.

### `sistemas`

```text
id uuid primary key
codigo text unique not null       -- pje, eproc, projudi, saj
nome text unique not null
versao text null
fabricante text null
ativo boolean not null default true
observacoes text null
created_at timestamptz
updated_at timestamptz
```

### `crawlers`

Neste projeto, crawler significa adaptador de fonte, e nao necessariamente scraping de navegador.

```text
id uuid primary key
codigo text unique not null       -- datajud, mural_cs, pje_trt9
nome text not null
tipo_fonte text not null          -- datajud, mural, pje_cs
sistema_id uuid null
tribunal_id uuid null
versao text null
status text not null              -- ativo, pausado, erro, em_validacao
ultima_execucao timestamptz null
ultima_atualizacao timestamptz null
observacoes text null
created_at timestamptz
updated_at timestamptz
```

Registros iniciais:

- `datajud_publico`: consulta por CNJ;
- `mural_cs`: Mural sincronizado pelo CS;
- `pje_trt9_cs`: acesso privado ao PJe TRT9.

Nao cadastrar `pje_trf4_cs` como ativo antes de testar login, cookies e endpoints do TRF4.

### RLS

- leitura e escrita global para Super Admin;
- leitura limitada para usuarios autenticados quando necessaria na interface;
- nenhum tenant altera o catalogo global;
- jobs usam service role somente no servidor.

## 5. Fase 3: evolucao de processos

Adicionar inicialmente como nullable:

```text
tribunal_id uuid references public.tribunais(id)
sistema_id uuid references public.sistemas(id)
crawler_id uuid references public.crawlers(id)
origem_extracao text
endpoint text
versao_crawler text
status_extracao text
tempo_consulta_ms integer
data_extracao timestamptz
ultima_validacao timestamptz
confianca numeric(5,4)
hash_origem text
observacao_extracao text
```

### Origem

Valores controlados:

- `datajud`;
- `mural`;
- `pje_cs`;
- `manual`;
- `legado`;
- `teste`.

Um processo pode ser enriquecido por mais de uma fonte. O historico detalhado deve ficar em eventos de extracao; `origem_extracao` representa o ultimo enriquecimento.

### Status

- `sucesso`;
- `sem_dados_novos`;
- `nao_encontrado`;
- `bloqueado`;
- `erro_transitorio`;
- `erro_permanente`;
- `legado_sem_rastreio`.

### Regras DataJud

1. Identificar tribunal pelo CNJ.
2. Consultar o endpoint correspondente.
3. Registrar endpoint, duracao e tentativas.
4. Atualizar metadados estruturados.
5. Inserir somente movimentacoes novas.
6. Registrar o crawler `datajud_publico`.
7. Nao declarar que encontrou processo novo: DataJud consulta CNJs conhecidos.

Referencias: [cliente DataJud](../../src/lib/datajud/client.ts), [mapeamento CNJ](../../src/lib/datajud/tribunal-from-cnj.ts) e [poller DataJud](../../src/app/api/cron/poll-datajud/route.ts).

### Regras Mural

1. Receber comunicacao pelo CS.
2. Guardar comunicacao original.
3. Associar por CNJ e OAB.
4. Registrar tribunal e data de disponibilizacao.
5. Executar Regex/IA para prazo, audiencia e metadados.
6. Registrar o crawler `mural_cs`.
7. Manter texto original para auditoria.

Referencia: [processamento do Mural](../../src/lib/mural/processar-comunicacao.ts).

### Regras PJe/CS

1. Guardar sessao somente de forma criptografada/local.
2. Associar sessao a `tenant_id` e `tribunal_id`.
3. Nunca reutilizar cookies entre tribunais.
4. Registrar versao do CS.
5. Registrar expiracao e erro de autenticacao.
6. Enviar somente dados permitidos ao tenant pareado.

O suporte deve ser marcado como TRT9 ate que cada tribunal tenha login e endpoints testados. Referencias: [constantes do CS](../../meujudi-cs/src/shared/constants.ts) e [autenticacao PJe](../../meujudi-cs/src/main/pje-auth.ts).

## 6. Fase 4: auditoria

O sistema ja possui estruturas relacionadas, como `motor_extracao_log`, `datajud_sync_jobs`, `cs_devices` e logs do CS. Ampliar essas estruturas antes de criar duplicatas.

Tabela recomendada: `source_sync_runs`.

```text
id uuid primary key
tenant_id uuid null
crawler_id uuid not null
tribunal_id uuid null
started_at timestamptz not null
finished_at timestamptz null
duration_ms integer null
attempt_count integer not null default 0
items_read integer not null default 0
items_created integer not null default 0
items_updated integer not null default 0
items_discarded integer not null default 0
last_error text null
last_success_at timestamptz null
app_version text null
status text not null
metadata jsonb not null default '{}'
```

Nunca salvar em logs:

- chaves de API;
- secrets;
- service role key;
- certificado A1;
- senha;
- cookies completos;
- tokens de sessao.

Cada execucao deve ter `run_id`, presente no log da Vercel, no CS, no banco e no painel Super Admin.

## 7. Matriz de cobertura

A planilha deve evoluir para uma tabela global, por exemplo `tribunal_coverage`:

```text
id uuid primary key
tribunal_id uuid not null
crawler_id uuid null
sistema_id uuid null
status text not null              -- nao_testado, parcial, validado, bloqueado
meujudi_validado boolean not null default false
processo_encontrado_no_teste boolean not null default false
advogado_confirmou_processos boolean null
data_validacao timestamptz null
responsavel text null
evidencia jsonb not null default '{}'
observacoes text null
```

A evidencia deve registrar quantidade de processos, comunicacoes do Mural, fonte, versao do CS, status HTTP e data do teste.

Nao marcar “CS/PJe validado” apenas porque o tribunal apareceu no banco via DataJud ou Mural.

## 8. RLS e multi-tenant

- usuarios comuns veem somente o proprio `tenant_id`;
- Super Admin acessa globalmente por rota e role separadas;
- jobs de sistema usam service role somente no servidor;
- `tenant_id` e validado no pareamento do CS;
- dados privados do PJe nunca sao redistribuidos para outro tenant;
- tabelas globais so sao alteradas pelo Super Admin.

## 9. Ordem de execucao

### Bloco 1: limpeza controlada

- inventario;
- normalizacao de siglas;
- normalizacao de sistemas;
- separacao entre `Inválido` e `NULL`;
- identificacao de testes;
- conferencia de totais e rollback.

### Bloco 2: catalogo

- criar `sistemas`;
- criar `tribunais`;
- criar `crawlers`;
- inserir catalogo inicial;
- aplicar RLS;
- criar funcoes de normalizacao.

### Bloco 3: processos

- adicionar FKs nullable;
- executar backfill;
- preencher origem nos novos fluxos;
- manter campos legados;
- criar indices por tenant, tribunal, sistema e crawler.

### Bloco 4: auditoria

- criar ou ampliar registros de execucao;
- gerar `run_id`;
- registrar tentativas, duracao, sucesso e erro;
- exibir historico no Super Admin.

### Bloco 5: cobertura

- importar a matriz atual;
- criar tabela global;
- validar por fonte;
- diferenciar DataJud, Mural e CS/PJe;
- criar filtros por tribunal, sistema e status.

### Bloco 6: dashboards

- dashboard nacional;
- dashboard por sistema;
- saude dos adaptadores;
- alertas de falha consecutiva;
- historico de alteracoes.

## 10. Criterios de aceite

### Dados

- nenhum tribunal duplicado por caixa alta/baixa;
- nenhum sistema duplicado por variacao de escrita;
- `Inválido` nao aparece como sistema operacional;
- processos antigos continuam acessiveis;
- registros `TESTE` ficam identificados.

### Integracoes

- cada processo identifica a fonte do ultimo enriquecimento;
- DataJud registra consulta, duracao e resultado;
- Mural preserva texto original e dados estruturados;
- CS registra tribunal, tenant e versao;
- um tribunal so e marcado como PJe/CS depois de login e consulta reais.

### Seguranca e operacao

- nenhum segredo aparece em logs;
- RLS impede leitura cruzada;
- falha de um tribunal nao interrompe os demais;
- jobs continuam de onde pararam;
- painel informa ultimo sucesso, erro e proxima tentativa;
- toda execucao possui `run_id` e versao da aplicacao.

## 11. Arquivos de referencia

- [Schema inicial](../../supabase/migrations/20260716000000_foundation_schema.sql)
- [Cliente DataJud](../../src/lib/datajud/client.ts)
- [Mapeamento CNJ](../../src/lib/datajud/tribunal-from-cnj.ts)
- [Poller DataJud](../../src/app/api/cron/poll-datajud/route.ts)
- [Cliente Mural](../../src/lib/mural/client.ts)
- [Processamento Mural](../../src/lib/mural/processar-comunicacao.ts)
- [Constantes do CS](../../meujudi-cs/src/shared/constants.ts)
- [Autenticacao PJe](../../meujudi-cs/src/main/pje-auth.ts)
- [Roadmap pendente](IMPLEMENTACOES-PENDENTES.md)

