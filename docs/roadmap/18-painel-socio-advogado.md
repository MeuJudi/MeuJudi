# 18 - Painel do Socio e Advogado

Este documento define a primeira versao do painel usado pelos tenants da vertical MeuJudi.

Referencia visual: `C:\Users\User\Downloads\MeuJudi_Demo.html`.

## Hierarquia

- Super Admin: administra a plataforma.
- Vertical MeuJudi: produto juridico.
- Tenant: escritorio.
- Users: socio/owner, advogado, equipe.

## Papeis

- `owner`: socio/dono do escritorio. Pode configurar o tenant, equipe, OABs, CS e dados do escritorio.
- `lawyer`: advogado do escritorio. Pode trabalhar com processos, agenda, clientes e comunicacoes.
- `staff`: apoio/assistente. Acesso mais restrito, inicialmente apenas dados atribuidos ou liberados.

## Principio do painel

O painel do tenant e o produto MeuJudi em si. Ele deve parecer simples, juridico e operacional, sem linguagem tecnica desnecessaria.

O owner e o advogado entram no mesmo app, mas o owner enxerga controles extras de configuracao do escritorio. O Super Admin continua separado, em outra area, antes das verticais.

## Identidade visual

Vamos usar o demo HTML como base do MeuJudi:

- Sidebar azul-escura (`#16233A`) com destaque dourado/brass (`#B8863B`).
- Fundo claro tipo papel (`#F6F3EA`) e cards brancos com borda discreta (`#D9D2BF`).
- Tipografia: Fraunces para marca/titulos principais, IBM Plex Sans para UI e IBM Plex Mono para CNJ, datas tecnicas e codigos.
- Estados: vinho para urgente/erro, brass para andamento/media prioridade, moss para ativo/concluido/baixo risco.
- Layout de produto: sidebar + topbar + area de trabalho, sem cara de landing page.

## Navegacao MVP

Baseada no HTML demo:

- `/monitoramento`: primeira tela do app. Lista/Kanban de processos monitorados, movimentacoes e comunicacoes relevantes.
- `/monitoramento/[cnj]`: detalhe do processo.
- `/agenda`: calendario mensal e lista de prazos/audiencias.
- `/tarefas`: kanban operacional da equipe.
- `/clientes`: clientes, CRM simples e historico de contato.
- `/relatorios`: visoes consolidadas do escritorio, abaixo de Clientes na navegacao.
- `/configuracoes`: perfil, escritorio, equipe, OABs, notificacoes, CS/PJe, integracoes, termos/LGPD.

Rotas que estavam separadas e entram dentro de outras:

- `/dashboard`: vira resumo dentro de `/monitoramento` ou uma faixa superior da tela inicial. Nao precisa ser menu separado no MVP se o Monitoramento ja responder "o que exige atencao hoje?".
- `/processos`: vira `/monitoramento`, porque o demo usa essa linguagem e ela explica melhor o valor.
- `/mural`: entra como aba/filtro dentro de `/monitoramento`, porque e uma descoberta/comunicacao vinculada a processo ou OAB.
- `/team`: entra em `/configuracoes/equipe`, visivel com poderes de edicao para owner.
- `/cs`: entra em `/configuracoes/cs-pje`, com status, download, instrucoes e diagnostico do escritorio.

## Diferenca entre Socio e Advogado

Socio/owner:
- Ve resumo do escritorio inteiro.
- Gerencia equipe e convites.
- Configura OABs monitoradas.
- Configura dados do escritorio.
- Ve status do CS/PJe do escritorio.
- Pode alterar responsaveis e permissoes.

Advogado:
- Ve processos, prazos, clientes e comunicacoes liberados para ele.
- Pode atualizar itens de trabalho.
- Pode criar anotacoes e eventos.
- Nao altera configuracoes estruturais do escritorio.
- Nao gerencia convites ou roles.

## Dashboard

No MVP, o dashboard vira a parte superior do Monitoramento.

Objetivo: responder rapidamente "o que precisa da minha atencao hoje?" sem criar uma tela separada vazia.

Blocos:
- Prazos proximos.
- Audiencias proximas.
- Movimentacoes novas.
- Comunicacoes do Mural pendentes.
- Processos monitorados.
- Status do CS/PJe.
- Alertas de configuracao, como OAB ausente ou CS desconectado.

## Monitoramento

Lista:
- Busca por CNJ, parte, cliente, tag ou tribunal.
- Filtros por status, responsavel, prazo, audiencia, favorito e sigilo.
- Acoes: favoritar, atribuir responsavel, adicionar tag e abrir detalhe.
- Abas: `Lista`, `Kanban`, `Mural/descobertas`.
- Indicadores no topo: processos ativos, novos hoje, prazos proximos, comunicacoes pendentes e status do CS/PJe.

Detalhe:
- Capa do processo.
- Partes e advogados.
- Movimentacoes.
- Comunicacoes do Mural.
- Agenda vinculada.
- Anotacoes internas.
- Documentos/PDFs futuramente.
- Resumo IA futuramente.

## Tarefas

Objetivo: organizar o trabalho interno do escritorio sem virar um sistema juridico complexo.

Visao inicial:
- Kanban com colunas simples: `A fazer`, `Em andamento`, `Aguardando`, `Concluido`.
- Cards ligados a processo, cliente ou tarefa avulsa.
- Prioridade: alta, media, baixa.
- Responsavel.
- Prazo interno.

Permissoes:
- Owner pode ver e redistribuir tudo.
- Advogado ve tarefas do escritorio ou atribuicoes conforme regra definida.
- Staff pode comecar restrito ao que foi atribuido.

## Agenda

Objetivo: unir prazos, audiencias e eventos manuais.

Visoes:
- Hoje.
- Proximos 7 dias.
- Calendario mensal.
- Lista por urgencia.

Eventos:
- Audiencia.
- Prazo.
- Reuniao.
- Lembrete.

## Mural e descobertas

Objetivo: mostrar comunicacoes publicas encontradas uma vez pelo sistema e distribuidas ao tenant correto.

No menu, entra dentro de `/monitoramento`, nao como item principal inicialmente.

Estados:
- Novo.
- Revisado.
- Vinculado a processo.
- Descartado pelo usuario.

Regra:
- Dado publico sem match CNJ/OAB com algum tenant deve ser descartado pelo pipeline.
- O tenant ve apenas comunicacoes vinculadas ao proprio escritorio.

## Clientes

Objetivo MVP: cadastro simples para organizar processos e historico de relacionamento.

Campos:
- Nome.
- Documento.
- Contato.
- Processos vinculados.
- Observacoes.

Abas:
- `Clientes`: tabela/lista.
- `CRM`: funil simples e historico de contato.

## Relatorios

Objetivo: dar visoes consolidadas do escritorio sem virar BI complexo no MVP.

No MVP:
- Processos por status.
- Prazos por periodo.
- Audiencias proximas.
- Movimentacoes novas por tribunal.
- Tarefas por responsavel.
- Comunicacoes do Mural/DataJud encontradas e vinculadas.

Depois:
- Produtividade por advogado/equipe.
- Relatorio por cliente.
- Relatorio de risco/prazos criticos.
- Exportacao em PDF/CSV.
- Indicadores financeiros quando o modulo financeiro existir.

## Financeiro

Nao entra como menu principal no primeiro desenho do MVP, mas fica planejado como modulo futuro.

Possivel escopo:
- Honorarios contratados.
- Parcelas e vencimentos.
- Recebimentos.
- Despesas do processo.
- Custas e taxas.
- Repasse por advogado/socio futuramente.
- Relatorios financeiros.

O financeiro deve ser simples no inicio e nao bloquear o uso juridico do sistema.

## IA

Nao entra como menu principal inicialmente. A IA aparece dentro das telas onde ajuda o trabalho.

No MVP:
- Resumo de movimentacoes no detalhe do processo.
- Leitura/organizacao de textos longos e comunicacoes.
- Classificacao de prioridade.
- Sugestao de tags/status.
- Ajuda para identificar prazo, audiencia, parte, CNJ e tribunal.

Depois:
- Chat contextual do escritorio.
- Perguntas sobre processos.
- Minutas e rascunhos.
- Busca inteligente.
- Analise de risco.
- Auditoria de uso e anonimizacao antes de enviar dados sensiveis.

## Equipe

No menu, entra dentro de Configuracoes.

Owner:
- Ver membros.
- Criar convite.
- Revogar convite.
- Alterar role entre `owner`, `lawyer` e `staff`.

Advogado/staff:
- Ver perfil proprio e membros basicos do escritorio.

## CS/PJe

No menu, entra dentro de Configuracoes.

Objetivo:
- Explicar o CS.
- Baixar instalador.
- Mostrar ultimo status conhecido.
- Mostrar ultimo diagnostico do escritorio quando existir vinculacao por tenant.

MVP:
- Download e instrucoes.
- Status manual/informativo.
- Botao para baixar o instalador.
- Versao recomendada do CS.
- Passo a passo de conexao com PJe.
- Status: conectado, desconectado, erro, ultima tentativa.
- Ultimo diagnostico vinculado ao escritorio.
- Avisos de certificado A1, PJeOffice/GOV e cookies/sessao.

Depois:
- Vincular diagnosticos do CS ao tenant.
- Exibir ultimo erro do CS no painel do owner.
- Historico de diagnosticos do escritorio.
- Acao para reenviar diagnostico.
- Status de sincronizacao do PJe.

## Configuracoes

Perfil:
- Nome.
- Email.
- OABs pessoais.

Escritorio:
- Nome.
- Cidade/UF.
- OABs monitoradas.
- Preferencias de notificacao.

Seguranca/LGPD:
- Aceite de termos.
- Politica de retencao.
- Exportacao/solicitacao de dados futuramente.

Secoes esperadas:
- `Meu perfil`
- `Escritorio`
- `Equipe e permissoes`
- `OABs monitoradas`
- `Notificacoes`
- `Aparencia`
- `CS/PJe`
- `Integracoes`
- `Seguranca e LGPD`

### Aparencia

Objetivo: permitir personalizacao simples sem quebrar identidade e contraste.

Opcoes:
- Tema claro.
- Tema escuro.
- Cor do sistema/acento.

Comportamento:
- Tema claro usa base clara do demo.
- Tema escuro usa base escura equivalente.
- Cor escolhida altera principalmente acentos: item ativo da sidebar, botoes principais, foco, badges selecionados e links.
- Cores de estado juridico/operacional continuam consistentes: erro/urgente, sucesso/concluido e alerta nao devem depender apenas da cor personalizada.
- A cor personalizada deve passar contraste minimo antes de ser aplicada.

## Telas prioritarias para desenhar primeiro

1. App shell: sidebar/topbar seguindo o demo.
2. Monitoramento: lista de processos + resumo superior.
3. Detalhe do processo.
4. Agenda mensal.
5. Tarefas em kanban.
6. Clientes + CRM simples.
7. Configuracoes com secoes internas.

## Decisoes ainda abertas

- Se o advogado ve todos os processos do tenant no MVP ou apenas os atribuidos a ele.
- Se clientes entram como cadastro obrigatorio ou apenas organizacao opcional.
- Como sera o primeiro alerta quando o CS/PJe estiver desconectado.
- Quais eventos sensiveis do tenant devem aparecer tambem na auditoria do Super Admin.
- Quando o resumo por IA aparece no detalhe do processo.
- Se `Mural/descobertas` fica apenas como aba do Monitoramento no MVP ou ganha menu proprio depois.
- Se `Financeiro` fica fora do MVP ou entra como area futura.
- Se IA deve ter uma tela propria depois ou continuar embutida nas telas.

## Ordem sugerida de implementacao

1. Layout do app do tenant com sidebar/topbar.
2. Tokens visuais do demo em Tailwind/global CSS.
3. Monitoramento com dados reais do Supabase.
4. Detalhe do processo.
5. Agenda.
6. Tarefas.
7. Clientes/CRM.
8. Relatorios.
9. Configuracoes do escritorio, equipe, aparencia e CS/PJe.
10. Melhorias de permissao por role.
