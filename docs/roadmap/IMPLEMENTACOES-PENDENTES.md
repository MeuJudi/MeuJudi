# Implementacoes pendentes

Este documento centraliza o que ainda precisa ser implementado para colocar os motores de busca, sincronizacao e distribuicao de dados em funcionamento.

## Status geral

| Bloco | Situacao |
| --- | --- |
| Banco, tenants e RLS | Base criada; falta validar todas as migrations no ambiente final |
| Painel Web | Funcionando para leitura e operacoes ja implementadas |
| DataJud | Planejado; motor automatico ainda nao publicado |
| Mural | Planejado; motor automatico ainda nao publicado |
| PJe/CS | CS possui fluxo proprio; integracao completa de dados com o Web ainda pendente |
| IA e Regex | Fundacao criada; pipeline de ingestao ainda pendente |
| CronJobs | Planejados; execucoes automaticas ainda pendentes |
| Distribuicao multi-tenant | Regras definidas; pipeline de cruzamento e descarte ainda pendente |

## 1. DataJud

Especificacao: [06-edge-datajud.md](06-edge-datajud.md)

- [ ] Criar a Edge Function `poll-datajud`.
- [ ] Consultar os tribunais configurados.
- [ ] Implementar paginacao, retries e backoff.
- [ ] Controlar rate limit por tribunal.
- [ ] Atualizar processos e movimentacoes no Supabase.
- [ ] Interpretar prazos em dias e horas.
- [ ] Criar logs estruturados de cada execucao.
- [ ] Configurar os CronJobs.
- [ ] Testar consultas em multiplos tribunais.
- [ ] Validar deduplicacao e atualizacao incremental.

## 2. Mural

Especificacao: [07-edge-mural.md](07-edge-mural.md)

- [ ] Criar a Edge Function `poll-mural`.
- [ ] Buscar comunicacoes por OAB e UF.
- [ ] Evitar duplicidades por identificador da comunicacao.
- [ ] Criar processos descobertos quando necessario.
- [ ] Salvar partes, advogados e comunicacoes.
- [ ] Criar eventos e prazos na agenda.
- [ ] Configurar o CronJob semanal.
- [ ] Implementar teste real com uma OAB.
- [ ] Validar o descarte de comunicacoes sem tenant vinculado.

## 3. PJe e MeuJudi CS

Especificacao principal: [09-cert-a1.md](09-cert-a1.md)

Plano de implementacao do CS: [16-implementacao-cert-a1.md](16-implementacao-cert-a1.md)

- [ ] Finalizar o polling do PJe no aplicativo CS.
- [ ] Implementar ou finalizar os endpoints de consulta do PJe.
- [ ] Receber os dados sincronizados pelo CS no Web.
- [ ] Normalizar processos, movimentacoes e documentos.
- [ ] Associar cada conexao ao tenant correto.
- [ ] Criptografar cookies e credenciais.
- [ ] Implementar renovacao de sessao e retry.
- [ ] Registrar falhas detalhadas de sincronizacao.
- [ ] Notificar quando a sessao expirar.
- [ ] Validar o fluxo com certificado A1 e PJe Office.

## 4. IA e Regex

Especificacao: [08-ia-regex.md](08-ia-regex.md)

- [ ] Conectar a pipeline de extracao aos dados recebidos do DataJud, Mural, PJe e PDFs.
- [ ] Executar primeiro a camada estruturada e Regex.
- [ ] Usar IA somente quando necessario.
- [ ] Anonimizar dados antes do envio para IA.
- [ ] Registrar origem, confianca e resultado de cada campo extraido.
- [ ] Implementar revisao e aprendizado das regras.
- [ ] Finalizar testes com textos e PDFs reais anonimizados.

## 5. Distribuicao multi-tenant

Arquitetura geral: [00-visao-geral.md](00-visao-geral.md)

Revisao de arquitetura: [REVISAO-ANTES-IMPLEMENTAR.md](REVISAO-ANTES-IMPLEMENTAR.md)

- [ ] Fazer uma unica busca publica por fonte.
- [ ] Extrair CNJs, OABs e demais identificadores dos resultados.
- [ ] Cruzar os identificadores com os tenants ativos.
- [ ] Criar vinculos somente quando houver correspondencia confirmada.
- [ ] Permitir que um mesmo resultado seja distribuido a mais de um tenant quando aplicavel.
- [ ] Descartar os itens sem qualquer tenant correspondente.
- [ ] Impedir vazamento entre tenants com testes de RLS e de pipeline.
- [ ] Registrar a origem e o motivo de cada distribuicao ou descarte.

## 6. CronJobs e operacao

Especificacao: [15-sync-config-limites.md](15-sync-config-limites.md)

- [ ] Criar a configuracao de sincronizacao por tenant.
- [ ] Implementar o job principal de DataJud.
- [ ] Implementar o job semanal do Mural.
- [ ] Implementar o job de sincronizacao do CS/PJe quando aplicavel.
- [ ] Configurar retries e backoff.
- [ ] Registrar inicio, fim, duracao, itens processados e erros.
- [ ] Criar alertas para falhas consecutivas.
- [ ] Implementar limpeza de dados antigos conforme politica definida.
- [ ] Implementar controle de quota e armazenamento.
- [ ] Criar uma visao administrativa da saude dos motores.

## 7. Seguranca e conformidade

Referencias: [REVISAO-ANTES-IMPLEMENTAR.md](REVISAO-ANTES-IMPLEMENTAR.md) e [09-cert-a1.md](09-cert-a1.md)

- [ ] Armazenar chaves e segredos somente em variaveis protegidas ou Supabase Vault.
- [ ] Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no navegador.
- [ ] Proteger os endpoints dos jobs com segredo proprio, como `CRON_SECRET`.
- [ ] Criptografar dados sensiveis antes do uso amplo em producao.
- [ ] Completar auditoria de sincronizacoes e acessos.
- [ ] Documentar retencao, descarte e anonimização.
- [ ] Validar os fluxos de incidente e revogacao de conexoes.

## 8. Ordem recomendada

1. Validar migrations, segredos e estrutura de logs.
2. Implementar DataJud com dados de teste.
3. Implementar distribuicao multi-tenant para os dados DataJud.
4. Implementar Mural e sua distribuicao.
5. Finalizar ingestao do CS/PJe.
6. Conectar IA e Regex ao pipeline real.
7. Ativar CronJobs e alertas.
8. Executar testes de isolamento, duplicidade, falha e recuperacao.

## Criterio para considerar os motores prontos

Cada bloco somente deve ser considerado concluido quando tiver:

- codigo publicado no ambiente correspondente;
- segredo e configuracao definidos sem dados sensiveis no Git;
- execucao manual validada;
- execucao automatica validada;
- logs de sucesso e erro;
- teste de duplicidade;
- teste de isolamento entre tenants;
- estrategia de retry e recuperacao;
- evidencia de dados chegando corretamente ao painel Web.
