# Inventario Inicial do Banco MeuJudi

Data da coleta: 2026-07-27

Este relatorio foi gerado por consultas somente leitura ao Supabase configurado no projeto. Nenhum dado foi alterado.

## Totais

| Tabela | Registros |
|---|---:|
| `processos` | 1.007 |
| `movimentacoes` | 67.451 |
| `comunicacoes_mural` | 4.479 |
| `escritorio_oabs` | 1 |
| `cs_devices` | 2 |
| `motor_extracao_log` | 2.084 |
| `datajud_sync_jobs` | 2 |

## Processos por tribunal

O banco possui siglas em caixa alta e baixa. A contagem abaixo preserva o valor original para evidenciar a necessidade de normalizacao:

| Valor atual | Quantidade |
|---|---:|
| `TJPR` | 508 |
| `tjpr` | 203 |
| `TRT9` | 125 |
| `TRF4` | 42 |
| `TJSC` | 28 |
| `tjsp` | 22 |
| `TJRJ` | 18 |
| `tjsc` | 9 |
| `TJMG` | 5 |
| `stj` | 5 |
| `TJMA` | 4 |
| `TRT2` | 4 |
| `TRT15` | 3 |
| `trt9` | 3 |
| `TJES` | 3 |
| `TJPB` | 3 |
| `TESTE` | 2 |
| `trf4` | 2 |
| `tjmt` | 2 |
| `tjrj` | 1 |
| `TRT12` | 1 |
| `tjms` | 1 |
| `TJRS` | 1 |
| `TRF2` | 1 |
| `TJDFT` | 1 |
| `TJGO` | 1 |
| `TJMS` | 1 |
| `TRT16` | 1 |

Observacoes:

- nao ha `tribunal` nulo;
- existem 2 registros com tribunal `TESTE`;
- a mesma sigla aparece com caixa alta e baixa;
- o proximo passo deve usar codigo interno estavel e sigla de exibicao padronizada.

## Processos por sistema

| Valor atual | Quantidade |
|---|---:|
| `Eproc` | 508 |
| `NULL` | 250 |
| `PJe` | 163 |
| `Projudi` | 67 |
| `EPROC` | 7 |
| `Pje` | 2 |
| `Inválido` | 2 |
| `SAJ` | 1 |

Problemas confirmados:

- `Eproc` e `EPROC` representam o mesmo sistema;
- `PJe` e `Pje` representam o mesmo sistema;
- 250 processos ainda nao possuem sistema identificado;
- 2 processos possuem o valor `Inválido`;
- `NULL` deve significar “nao identificado”, nao “sem sistema”.

## Fontes de sincronizacao atuais

| Campo | Processos preenchidos |
|---|---:|
| `ultima_sync_datajud` | 750 |
| `ultima_sync_mural` | 998 |
| `ultima_sync_pje` | 0 |

O campo `source_context` nao esta vazio nos processos consultados, mas ainda nao existem as colunas do novo roadmap para registrar origem, crawler, endpoint, duracao e confianca.

## Colunas do roadmap ainda ausentes em `processos`

As seguintes colunas ainda nao existem na tabela atual:

- `tribunal_id`;
- `sistema_id`;
- `crawler_id`;
- `origem_extracao`;
- `endpoint`;
- `versao_crawler`;
- `status_extracao`;
- `tempo_consulta_ms`;
- `data_extracao`;
- `ultima_validacao`;
- `confianca`;
- `hash_origem`;
- `observacao_extracao`.

## Mural

As 4.479 comunicacoes possuem `tenant_id` e `processo_id` preenchidos.

| Tribunal | Quantidade |
|---|---:|
| `TJPR` | 720 |
| `TRT9` | 170 |
| `TJRJ` | 24 |
| `TJSP` | 23 |
| `TJSC` | 13 |
| `TRT2` | 13 |
| `TRF4` | 12 |
| `TJES` | 4 |
| `TJMG` | 4 |
| `TRT15` | 3 |
| `TJDFT` | 3 |
| `TJGO` | 3 |
| `TJMA` | 2 |
| `TJPB` | 2 |
| `STJ` | 2 |
| `TJMS` | 1 |
| `TRT16` | 1 |

Meios registrados:

- `D`: 977;
- `E`: 23.

## OAB e tenant

- 1 OAB cadastrada;
- 1 OAB ativa;
- 1 tenant com OAB cadastrada;
- 1.000 processos possuem tenant;
- 7 processos nao possuem tenant.

Os 7 processos sem tenant precisam ser investigados antes da criacao das novas FKs. Nao devem ser atribuidos automaticamente a um escritorio.

## Conclusao da primeira etapa

O inventario confirma que a proxima etapa segura e preparar backup e rollback para a normalizacao. Ainda nao foi aplicada nenhuma alteracao de dados.

## Referencias

- [Schema inicial](../../../supabase/migrations/20260716000000_foundation_schema.sql)
- [Cliente DataJud](../../../src/lib/datajud/client.ts)
- [Processamento do Mural](../../../src/lib/mural/processar-comunicacao.ts)
- [Guia de implementacao](../IMPLEMENTACAO-ROADMAP-TECNICO-BANCO.md)
