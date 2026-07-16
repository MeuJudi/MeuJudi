# 18 - Painel do Socio e Advogado

Este documento define a primeira versao do painel usado pelos tenants da vertical MeuJudi.

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

## Navegacao MVP

- `/dashboard`: visao geral do escritorio.
- `/processos`: lista de processos.
- `/processos/[cnj]`: detalhe do processo.
- `/agenda`: prazos, audiencias e compromissos.
- `/mural`: comunicacoes capturadas do Mural/DataJud que precisam de atencao.
- `/clientes`: lista de clientes.
- `/team`: equipe e convites.
- `/cs`: status, download e diagnosticos do MeuJudi CS.
- `/configuracoes`: configuracoes do perfil e escritorio.

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

Objetivo: responder rapidamente "o que precisa da minha atencao hoje?".

Blocos:
- Prazos proximos.
- Audiencias proximas.
- Movimentacoes novas.
- Comunicacoes do Mural pendentes.
- Processos monitorados.
- Status do CS/PJe.
- Alertas de configuracao, como OAB ausente ou CS desconectado.

## Processos

Lista:
- Busca por CNJ, parte, cliente, tag ou tribunal.
- Filtros por status, responsavel, prazo, audiencia, favorito e sigilo.
- Acoes: favoritar, atribuir responsavel, adicionar tag e abrir detalhe.

Detalhe:
- Capa do processo.
- Partes e advogados.
- Movimentacoes.
- Comunicacoes do Mural.
- Agenda vinculada.
- Anotacoes internas.
- Documentos/PDFs futuramente.
- Resumo IA futuramente.

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

Estados:
- Novo.
- Revisado.
- Vinculado a processo.
- Descartado pelo usuario.

Regra:
- Dado publico sem match CNJ/OAB com algum tenant deve ser descartado pelo pipeline.
- O tenant ve apenas comunicacoes vinculadas ao proprio escritorio.

## Clientes

Objetivo MVP: cadastro simples para organizar processos.

Campos:
- Nome.
- Documento.
- Contato.
- Processos vinculados.
- Observacoes.

## Equipe

Owner:
- Ver membros.
- Criar convite.
- Revogar convite.
- Alterar role entre `owner`, `lawyer` e `staff`.

Advogado/staff:
- Ver perfil proprio e membros basicos do escritorio.

## CS/PJe

Objetivo:
- Explicar o CS.
- Baixar instalador.
- Mostrar ultimo status conhecido.
- Mostrar ultimo diagnostico do escritorio quando existir vinculacao por tenant.

MVP:
- Download e instrucoes.
- Status manual/informativo.

Depois:
- Vincular diagnosticos do CS ao tenant.
- Exibir ultimo erro do CS no painel do owner.

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

## Telas prioritarias para desenhar primeiro

1. Dashboard do escritorio: primeira tela apos login.
2. Processos: lista densa, com filtros e busca.
3. Detalhe do processo: tela de trabalho principal.
4. Agenda: prazos e audiencias.
5. Equipe: convites e permissoes, apenas para owner.
6. CS/PJe: download, status e diagnostico do escritorio.

## Decisoes ainda abertas

- Se o advogado ve todos os processos do tenant no MVP ou apenas os atribuidos a ele.
- Se clientes entram como cadastro obrigatorio ou apenas organizacao opcional.
- Como sera o primeiro alerta quando o CS/PJe estiver desconectado.
- Quais eventos sensiveis do tenant devem aparecer tambem na auditoria do Super Admin.
- Quando o resumo por IA aparece no detalhe do processo.

## Ordem sugerida de implementacao

1. Layout do app do tenant com sidebar/topbar.
2. Dashboard com dados reais do Supabase.
3. Lista de processos.
4. Detalhe do processo.
5. Agenda.
6. Mural/descobertas.
7. Clientes.
8. Configuracoes do escritorio.
9. Melhorias de permissao por role.
