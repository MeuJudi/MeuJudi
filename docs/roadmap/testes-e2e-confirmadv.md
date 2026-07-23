# Testes E2E — Validação de OAB via ConfirmADV

## Objetivo

Checklist manual dos 14 cenários da Fase 5 do roadmap de validação de OAB
([validacao-oab-confirmadv-cs.md](./validacao-oab-confirmadv-cs.md)). Estes
testes dependem de interação humana real com a página do ConfirmADV
(reCAPTCHA, código de e-mail) e não podem ser automatizados.

## Antes de começar

1. `cd C:\Caio\MeuJudi\MeuJudi-CS && npm run typecheck` (deve terminar 0 erros)
2. `node tests/validate-oab-flow.js` na raiz do MeuJudi (deve passar 61/61)
3. `node tests/confirmadv-helpers.test.js` no CS (deve passar 23/23)
4. Ter um tenant de teste criado no Supabase
5. Ter pelo menos um dispositivo CS pareado
6. Ter uma OAB real de advogado disponível para os testes positivos
7. Browser em janela anônima (para não vazar cache/cookies do ConfirmADV)

## Cenários

### 1. Validação positiva

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 1.1 | Login no MeuJudi Web com o advogado responsável | Tenant começa em `aguardando_validacao` (a menos que já esteja liberado) |
| 1.2 | Ir em `/validacao-oab` | Tela de validação visível |
| 1.3 | Preencher OAB, UF, e-mail profissional correto, nome do solicitante | Formulário validado |
| 1.4 | Clicar em "Iniciar validação" | Solicitação criada com status `pendente` |
| 1.5 | CS pareado detecta a solicitação (até 15s) | BrowserWindow do ConfirmADV abre com notificação |
| 1.6 | Preencher formulário na página oficial do ConfirmADV | OK |
| 1.7 | Resolver o reCAPTCHA manualmente | OK |
| 1.8 | Aguardar e-mail com código | Código chega |
| 1.9 | Inserir código no ConfirmADV | Página redireciona para sucesso |
| 1.10 | CS detecta sucesso e fecha a janela | Tenant vai para `liberado` |
| 1.11 | Recarregar o Web | Redirecionado para `/monitoramento` (não mais `/validacao-oab`) |
| 1.12 | Verificar `users.oab_validated_at` no Supabase | Preenchido com timestamp da validação |
| 1.13 | Verificar badge no header do monitoramento | "OAB XXXXX/UF validada" visível |

**Validação programática:**
```sql
select access_status from public.tenants where id = '<tenant_id>';
-- esperado: 'liberado'

select oab_validated_at from public.users where id = '<user_id>';
-- esperado: timestamp recente (não null)
```

### 2. OAB inexistente

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 2.1 | Em `/validacao-oab`, preencher com OAB que não existe na OAB | Formulário aceita (não validamos formato no client) |
| 2.2 | Clicar em "Iniciar validação" | Solicitação criada |
| 2.3 | CS abre ConfirmADV | OK |
| 2.4 | ConfirmADV rejeita após reCAPTCHA | Página mostra erro |
| 2.5 | CS detecta `rejected` | Status final `recusada` |
| 2.6 | Recarregar Web | Continua em `/validacao-oab` (não liberou) |
| 2.7 | Tela mostra `last_error` com mensagem genérica | "Nao foi possivel confirmar esses dados" |

### 3. UF incorreta

Mesmo fluxo do cenário 2, mas com UF errada para a OAB. Esperado:
- CS reporta `rejected`
- Tenant continua `aguardando_validacao`
- `last_error` preenchido

### 4. E-mail não correspondente

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 4.1 | Preencher com e-mail pessoal (não o profissional da OAB) | Solicitação criada |
| 4.2 | CS abre ConfirmADV | OK |
| 4.3 | ConfirmADV pede código em e-mail profissional | Código não chega (porque o e-mail é outro) |
| 4.4 | Após 15min (timeout do CS) | Janela fecha, status `expirada` |

### 5. reCAPTCHA não concluído

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 5.1 | CS abre ConfirmADV | OK |
| 5.2 | Preencher formulário mas **NÃO** marcar o reCAPTCHA | Tela do ConfirmADV impede submit |
| 5.3 | Fechar a janela do CS manualmente | Status `cancelada` (não há submissão no ConfirmADV) |

### 6. Código incorreto

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 6.1 | Preencher tudo corretamente, resolver reCAPTCHA | ConfirmADV envia código para e-mail |
| 6.2 | Inserir código errado 3 vezes | ConfirmADV bloqueia ou retorna erro |
| 6.3 | CS detecta `rejected` ou `failed` | Status final `recusada` ou `erro` |

### 7. Código expirado

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 7.1 | Aguardar 5+ minutos após receber o código (se o ConfirmADV expira nesse tempo) | OK |
| 7.2 | Tentar usar o código | ConfirmADV retorna erro de expiração |
| 7.3 | CS detecta | Status `expirada` |

### 8. Janela do CS fechada

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 8.1 | CS abre ConfirmADV | OK |
| 8.2 | Fechar a janela do CS (botão X do Windows) | Status `cancelada` |
| 8.3 | Verificar que o Web mostra o status atualizado | Status card mostra "cancelada" |

### 9. CS desconectado

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 9.1 | Iniciar validação no Web | Solicitação criada |
| 9.2 | Desligar o CS antes de abrir a janela | OK — solicitação fica `pendente` |
| 9.3 | Religar o CS | CS detecta solicitação pendente e abre janela |
| 9.4 | Completar o fluxo | OK |

### 10. Tentativa em tenant diferente

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 10.1 | CS pareado com tenant A | OK |
| 10.2 | Criar solicitação como usuário do tenant B | Solicitação criada no tenant B |
| 10.3 | CS pareado em A tenta fazer GET | Não vê a solicitação de B (escopo por tenant) |
| 10.4 | CS pareado em A tenta POST com `validationId` de B | Retorna 404 (`solicitacao_nao_encontrada`) |

**Validação programática:**
```sql
-- confirmar que o escopo está correto
select * from public.oab_validations where tenant_id = '<tenant_b_id>';
```

### 11. Usuário sem permissão

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 11.1 | Tentar acessar `/validacao-oab` como `super_admin` | Redireciona para `/monitoramento` (não vê a tela) |
| 11.2 | Tentar criar solicitação como `staff` sem OAB | Não deve conseguir (Fase 2 trata isso) |
| 11.3 | Tentar POST direto na API com user_id diferente | 401 ou 403 |

### 12. Duas solicitações simultâneas

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 12.1 | Criar solicitação A | OK |
| 12.2 | Tentar criar solicitação B antes de A terminar | Retorna a solicitação A (não cria B) |
| 12.3 | Cancelar A | A vai para `cancelada` |
| 12.4 | Criar B | B criada com sucesso |

**Validação programática:**
```sql
-- só pode haver 1 ativa por user_id (índice partial unique)
select count(*) from public.oab_validations
where user_id = '<user_id>'
  and status in ('pendente', 'aguardando_cs', 'recaptcha_em_andamento', 'aguardando_codigo', 'validando');
-- esperado: 0 ou 1
```

### 13. Revogação da validação

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 13.1 | Ter validação positiva | Tenant `liberado` |
| 13.2 | (Futuro) Botão "Revogar validação" | Tenant volta para `aguardando_validacao` |
| 13.3 | CS polling detecta mudança | Próxima validação pode começar |

> **Nota:** a revogação automática não está implementada na Fase 4. Está
> prevista como melhoria futura. Para testar, é preciso alterar o status
> manualmente no banco.

### 14. RLS entre tenants

| Passo | Ação | Resultado esperado |
|-------|------|-------------------|
| 14.1 | Criar 2 tenants (A e B) com 1 usuário cada | OK |
| 14.2 | Como usuário de A, criar solicitação | OK |
| 14.3 | Como usuário de B, listar `oab_validations` | Não vê a de A (RLS ativo) |
| 14.4 | Como service role, ver tudo | Vê ambas |

**Validação programática:**
```sql
-- confirmar que RLS está ativo
select relname, relrowsecurity from pg_class where relname = 'oab_validations';
-- esperado: t (true)

select relname, relrowsecurity from pg_class where relname = 'oab_validation_events';
-- esperado: t
```

## Matriz de cobertura

| Cenário | Automatizável | Teste manual | Cobre Fase |
|---------|--------------|--------------|------------|
| 1. Positiva | Parcial (até CS abrir) | ✅ | 1, 2, 3, 4 |
| 2. OAB inexistente | Não | ✅ | 1, 3 |
| 3. UF incorreta | Não | ✅ | 1, 3 |
| 4. E-mail errado | Não | ✅ | 3 |
| 5. reCAPTCHA não concluído | Não | ✅ | 3 |
| 6. Código incorreto | Não | ✅ | 3 |
| 7. Código expirado | Não | ✅ | 3 |
| 8. Janela fechada | Não | ✅ | 3 |
| 9. CS desconectado | Não | ✅ | 3 |
| 10. Tenant diferente | Parcial | ✅ | 1 |
| 11. Usuário sem permissão | Sim (com Playwright) | ✅ | 1, 2 |
| 12. Duas simultâneas | Sim | ✅ | 1 |
| 13. Revogação | Manual (não implementada) | — | 4 (futuro) |
| 14. RLS entre tenants | Sim (script SQL) | ✅ | 1 |

## Roteiro recomendado

1. Rodar `validate-oab-flow.js` e `confirmadv-helpers.test.js` (10s total)
2. Aplicar migrations em ambiente de homologação
3. Fazer cenário 1 com OAB real (validação completa)
4. Fazer cenários 2-9 com OAB real também (rejeições)
5. Cenários 10-14 (multi-tenant, RLS) podem ser feitos com SQL direto
6. Cenário 12 é o mais crítico — testar a constraint unique/partial
7. Cenário 14 — verificar via SQL que RLS está ativo

## Reportar problemas

Se algum cenário falhar, documente:
- Qual cenário e passo
- Comportamento esperado vs observado
- Logs do CS (`%APPDATA%/meujudi-cs/logs/`)
- Logs do Web (Vercel ou terminal)
- ID da validação (se aplicável)
- Evento reportado pelo CS (se aplicável)
