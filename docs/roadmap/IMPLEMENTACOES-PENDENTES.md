# Implementacoes pendentes

Este documento centraliza o que ainda precisa ser implementado para colocar os motores de busca, sincronizacao e distribuicao de dados em funcionamento.

**Ultima auditoria:** 21/07/2026. Os itens marcados como concluidos possuem implementacao identificada no repositorio. Deploy, configuracao externa e testes reais continuam separados quando ainda nao foram comprovados.

## Status geral

| Bloco | Situacao |
| --- | --- |
| Banco, tenants e RLS | Base criada; falta validar todas as migrations no ambiente final |
| Painel Web | Funcionando para leitura e operacoes ja implementadas |
| DataJud | Codigo do poller implementado; ativacao e validacao em producao pendentes |
| Mural | Codigo do poller implementado; ativacao e validacao em producao pendentes |
| PJe/CS | Pareamento por tenant e sincronizacao do Mural implementados; PJe real, migration aplicada e teste ponta a ponta pendentes |
| IA e Regex | Fundacao, fila e rotas de processamento implementadas; validacao ponta a ponta pendente |
| CronJobs | Rotas e SQL de agendamento criados; configuracao no Supabase ainda pendente |
| Distribuicao multi-tenant | Distribuicao por OAB no Mural implementada; fluxo global completo ainda pendente |

## O que foi concluido nesta auditoria

- [x] Cliente DataJud com consulta por CNJ, identificacao de tribunais, retry e backoff.
- [x] Rota protegida `POST /api/cron/poll-datajud` para atualizar processos e movimentacoes.
- [x] Cliente Mural com consulta por OAB, paginacao e tratamento de respostas HTTP.
- [x] Rota protegida `POST /api/cron/poll-mural` para descobrir e distribuir comunicacoes.
- [x] Deduplicacao de comunicacoes do Mural por tenant e `mural_id`.
- [x] Deduplicacao de eventos automaticos da agenda por fonte e identificador.
- [x] Configuracao de frequencia por tenant em `tenants.sync_config`.
- [x] Rotas protegidas para processamento e coleta da fila de IA.
- [x] Arquivo SQL com os quatro agendamentos de CronJob.
- [x] Logs dos motores em `motor_extracao_log`.
- [x] Pareamento do CS por codigo/QR com token individual escopado ao tenant.
- [x] Rotas Web de pareamento, OABs e sincronizacao do Mural.
- [x] CS armazena o token criptografado e sincroniza o Mural pelo IP do escritorio.
- [x] Revogacao individual de dispositivos na configuracao do tenant.

Referencias: [poll-datajud](../../src/app/api/cron/poll-datajud/route.ts), [poll-mural](../../src/app/api/cron/poll-mural/route.ts), [cliente DataJud](../../src/lib/datajud/client.ts), [cliente Mural](../../src/lib/mural/client.ts) e [agendamentos](../../supabase/manual/20260722_cron_schedules.sql).

## 1. DataJud

Especificacao: [06-edge-datajud.md](06-edge-datajud.md)

- [x] Criar o poller `poll-datajud` como rota protegida do Web.
- [x] Consultar os tribunais candidatos a partir do CNJ.
- [x] Implementar retries e backoff.
- [x] Controlar rate limit por tribunal.
- [x] Atualizar processos e movimentacoes no Supabase.
- [x] Interpretar prazos em dias e horas.
- [x] Criar logs estruturados de cada execucao.
- [ ] Configurar os CronJobs.
- [ ] Testar consultas reais em multiplos tribunais.
- [x] Implementar atualizacao incremental por data da ultima movimentacao.
- [ ] Validar deduplicacao em ambiente com dados reais.

## 2. Mural

Especificacao: [07-edge-mural.md](07-edge-mural.md)

- [x] Criar o poller `poll-mural` como rota protegida do Web.
- [x] Buscar comunicacoes por OAB e UF.
- [x] Implementar paginacao da API do Mural.
- [x] Evitar duplicidades por tenant e identificador da comunicacao.
- [x] Criar processos descobertos quando necessario.
- [x] Salvar partes, advogados e comunicacoes.
- [x] Criar eventos e prazos na agenda.
- [ ] Configurar o CronJob semanal.
- [ ] Implementar teste real com uma OAB sem bloqueio do WAF.
- [x] Buscar somente OABs vinculadas a tenants ativos.
- [ ] Validar formalmente o descarte de comunicacoes sem tenant vinculado.

## 3. PJe e MeuJudi CS

Especificacao principal: [09-cert-a1.md](09-cert-a1.md)

Plano de implementacao do CS: [16-implementacao-cert-a1.md](16-implementacao-cert-a1.md)

Analise atual da integracao multi-tenant: [19-cs-sync-multitenant.md](19-cs-sync-multitenant.md)

- [ ] Finalizar o polling do PJe no aplicativo CS.
- [ ] Implementar ou finalizar os endpoints de consulta do PJe.
- [x] Receber os dados do Mural sincronizados pelo CS no Web.
- [ ] Receber processos e movimentacoes do PJe sincronizados pelo CS no Web.
- [ ] Normalizar processos, movimentacoes e documentos.
- [x] Associar cada dispositivo CS ao tenant correto.
- [ ] Validar isolamento da conexao com testes reais entre dois tenants.
- [x] Criptografar o token de pareamento no dispositivo CS.
- [ ] Criptografar cookies e credenciais.
- [ ] Implementar renovacao de sessao e retry.
- [ ] Registrar falhas detalhadas de sincronizacao.
- [ ] Notificar quando a sessao expirar.
- [ ] Validar o fluxo com certificado A1 e PJe Office.

## 4. IA e Regex

Especificacao: [08-ia-regex.md](08-ia-regex.md)

- [x] Conectar a pipeline de extracao aos dados recebidos pelo DataJud e Mural.
- [x] Executar primeiro a camada estruturada e Regex.
- [x] Encaminhar casos nao resolvidos para fila/processamento de IA quando aplicavel.
- [ ] Anonimizar dados antes do envio para IA.
- [x] Registrar origem, confianca e resultado de cada campo extraido.
- [x] Implementar revisao e aprendizado das regras em funcoes e logs.
- [ ] Finalizar testes com textos e PDFs reais anonimizados.

## 5. Distribuicao multi-tenant

Arquitetura geral: [00-visao-geral.md](00-visao-geral.md)

Revisao de arquitetura: [REVISAO-ANTES-IMPLEMENTAR.md](REVISAO-ANTES-IMPLEMENTAR.md)

- [x] Fazer uma unica busca por OAB compartilhada no Mural.
- [x] Extrair e usar OABs vinculadas aos tenants ativos.
- [x] Cruzar OABs com os tenants ativos.
- [x] Criar registros somente para tenants com vinculo confirmado.
- [x] Distribuir uma mesma comunicacao para mais de um tenant quando a OAB for compartilhada.
- [x] Nao armazenar comunicacoes de OABs sem tenant ativo vinculado.
- [ ] Implementar uma camada global temporaria para resultados DataJud/Mural com multiplos identificadores.
- [ ] Impedir vazamento entre tenants com testes de RLS e de pipeline.
- [x] Registrar a origem dos dados persistidos pelos pollers.
- [ ] Registrar formalmente o motivo de cada descarte.

## 6. CronJobs e operacao

Especificacao: [15-sync-config-limites.md](15-sync-config-limites.md)

- [x] Criar a configuracao de sincronizacao por tenant.
- [x] Implementar a rota principal de DataJud.
- [x] Implementar a rota do Mural.
- [ ] Implementar o job de sincronizacao do CS/PJe quando aplicavel.
- [x] Configurar retries e backoff nos clientes/pollers.
- [x] Registrar itens processados e erros no log do motor.
- [ ] Criar alertas para falhas consecutivas.
- [ ] Implementar limpeza de dados antigos conforme politica definida.
- [ ] Implementar controle de quota e armazenamento.
- [ ] Criar uma visao administrativa da saude dos motores.
- [ ] Aplicar o SQL de agendamento no Supabase com URL e `CRON_SECRET` reais.

## 7. Seguranca e conformidade

Referencias: [REVISAO-ANTES-IMPLEMENTAR.md](REVISAO-ANTES-IMPLEMENTAR.md) e [09-cert-a1.md](09-cert-a1.md)

- [ ] Armazenar chaves e segredos no Supabase Vault ou no provedor de deploy.
- [x] Manter `SUPABASE_SERVICE_ROLE_KEY` fora do navegador e do CS.
- [x] Proteger os endpoints dos jobs com `CRON_SECRET`.
- [ ] Criptografar dados sensiveis antes do uso amplo em producao.
- [ ] Completar auditoria de sincronizacoes e acessos.
- [ ] Documentar retencao, descarte e anonimização.
- [ ] Validar os fluxos de incidente e revogacao de conexoes.

## 8. Ordem recomendada

1. Aplicar a migration de sincronizacao e configurar `CRON_SECRET`, `DATAJUD_API_KEY` e URL de producao.
2. Ativar os quatro CronJobs no Supabase e executar os pollers manualmente.
3. Testar DataJud em multiplos tribunais e validar atualizacao incremental.
4. Testar Mural com uma OAB que nao esteja bloqueada pelo WAF.
5. Executar testes de isolamento, duplicidade, falha e recuperacao.
6. Aplicar a migration `20260722000003_cs_devices.sql` e testar pareamento, revogacao e RLS.
7. Completar anonimização, alertas, quota, retencao e monitoramento operacional.

O proximo passo imediato depois da migration e executar o teste ponta a ponta: gerar o codigo no Web, parear o CS, sincronizar o Mural e confirmar o dado no tenant correto. Depois disso, o sync real do PJe continua como o proximo bloco funcional.

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
