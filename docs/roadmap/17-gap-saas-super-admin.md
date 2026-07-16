# 17 - Gap SaaS e Super Admin

Este documento registra o que ainda falta depois da fundacao inicial do MeuJudi Web.

## Estado atual

- App Web Next.js criado na raiz do projeto.
- Supabase preparado em migrations locais, ainda sem aplicar no projeto remoto.
- Fluxos base existem para login, cadastro, onboarding, dashboard, CS e admin.
- RLS inicial foi desenhado por `tenant_id`, usando `public.users` como fonte de permissao.
- `super_admin` existe como role manual em `public.users.role`, mas a interface e tratada como area separada dos produtos.
- MVP segue gratuito, sem Stripe e sem limites de plano.

## Supabase

- Obter a chave publica/anon do projeto e preencher `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Preencher `SUPABASE_SERVICE_ROLE_KEY` apenas em ambiente servidor/local ignorado pelo Git.
- Aplicar as migrations em um Supabase limpo.
- Rodar testes reais de RLS com dois tenants.
- Validar que usuario comum nao consegue criar ou alterar `role = 'super_admin'`.
- Criar rotina segura para Caio promover manualmente um usuario a `super_admin`.
- Rodar advisors do Supabase antes de uso real.

## SaaS

- Definir o menu definitivo do escritorio no MVP.
- Implementar paginas internas reais de processos, movimentacoes, agenda, mural e configuracoes.
- Criar fluxo completo de convite por email.
- Criar tela de membros/equipe para o owner.
- Definir estados de tenant: ativo, suspenso e encerrado.
- Manter billing/Stripe fora do MVP, mas deixar pontos de extensao documentados.

## Super Admin

- Proteger `/admin` com checagem server-side de `super_admin`.
- Manter login separado em `/admin/login`.
- Criar layout de Super Admin com identidade propria, sem marca MeuJudi.
- Criar lista de ambientes/clientes.
- Criar detalhe de ambiente com usuarios, OABs, processos e auditoria.
- Criar tela global de auditoria.
- Criar acoes administrativas: suspender tenant, reativar tenant e revisar logs.
- Registrar auditoria para cada acao sensivel do Super Admin.

## Seguranca e LGPD

- Nunca expor `service_role` no frontend ou em variavel `NEXT_PUBLIC_`.
- Garantir RLS em todas as tabelas expostas no schema `public`.
- Registrar aceite de termos/politica no cadastro.
- Definir politica de retencao para dados publicos sem vinculo com tenant.
- Descartar itens de DataJud/Mural que nao tenham vinculo confirmado por CNJ/OAB.
- Adicionar protecao extra para processos sigilosos antes de uso amplo.
- Planejar criptografia de dados sensiveis antes de clientes reais em escala.
- Planejar anonimização/redacao antes de enviar dados sensiveis para IA.
- Criar plano de incidente e resposta LGPD.

## DataJud, Mural e CS

- Fonte publica/global: buscar uma vez, cruzar com CNJ/OAB dos tenants e distribuir apenas aos tenants vinculados.
- Fonte publica sem match: descartar, sem guardar conteudo desnecessario.
- Fonte privada CS/PJe: gravar somente no tenant que conectou.
- Manter integracao profunda do CS como prioridade secundaria depois de Auth/RLS.

## Antes do primeiro uso real

- Testar cadastro criando escritorio e owner.
- Testar convite por email.
- Testar isolamento entre dois tenants.
- Testar Super Admin sem vazar dados para usuarios comuns.
- Testar auditoria em cadastro, convite, alteracao de equipe, alteracao de tenant e acesso admin.
- Revisar migrations com Supabase Advisors.
