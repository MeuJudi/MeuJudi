# Auditoria Fase 5 — Sugestões (S)

Melhorias opcionais para a próxima iteração. Não bloqueiam produção, mas tornam
o sistema mais agradável de usar e mais fácil de manter.

## S1 — Reduzir intervalo de polling do CS

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:27`

**Sugestão:** O polling atual roda a cada 15s. Para o advogado que acabou de criar uma solicitação, 15s é muito — parece que "nada está acontecendo". Sugiro 8-10s.

**Trade-off:** Menos intervalo = mais requests ao Web. Mas o `GET /api/cs/oab-validations` é leve e cacheável. 10s é razoável.

**Critérios de aceite:**
- Intervalo de 10s (ou configurável)
- Logs mostram quantos polls por hora
- Carga no Supabase não aumenta significativamente

---

## S2 — Card de sucesso dedicado após validação

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/page.tsx`

**Sugestão:** Quando o `tenantStatus === 'liberado'`, mostrar um card de sucesso animado com:
- Ícone de check grande (verde, com animação de "pulse" no carregamento)
- Texto: "Identidade profissional validada"
- Subtexto: "Validação concluída em DD/MM/YYYY às HH:MM"
- 2 CTAs: "Ir para o painel" e "Ver configurações"
- Sem redirecionar automaticamente

(Relacionado com W2 — sugestão vai além e adiciona UI polida)

**Critérios de aceite:**
- Card aparece quando tenant está `liberado`
- Não redireciona automaticamente
- Botões funcionam corretamente

---

## S3 — Log estruturado de cada evento de lifecycle

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts` (vários pontos)

**Sugestão:** Adicionar log estruturado para cada evento importante, não só o que já tem. Formato:
```ts
recordDiagnosticEvent('oab_validation_lifecycle', 'info', `Etapa ${stage} atingida`, {
  validationId: validation.id,
  stage: 'browser_opened',
  durationMs: Date.now() - startedAt,
});
```

Permite debug remoto via Supabase (a tabela `diagnostic_events` é populada pelo `recordDiagnosticEvent`).

**Critérios de aceite:**
- Cada etapa crítica gera um evento
- Tabela `diagnostic_events` mostra a sequência completa de uma validação
- Permite reconstruir o que aconteceu em uma sessão que falhou

---

## S4 — Índice em `users(oab_validated_at)`

**Arquivo:** Nova migration

**Sugestão:** Se a UI começar a filtrar usuários por "validado ou não" (ex.: badge no painel admin), criar índice.

**Quando aplicar:** Somente se virar query frequente. Por enquanto, sem índice está OK porque a tabela `users` é filtrada por `tenant_id` primeiro (que já tem índice).

**Critérios de aceite:**
- Só criar índice quando houver query real que se beneficie
- Se criar, migration `20260723000016_users_oab_validated_at_idx.sql` com `create index ... on public.users(oab_validated_at) where oab_validated_at is not null`

---

## S5 — Mostrar "Última validação" no formulário

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/validacao-form.tsx`

**Sugestão:** Se o usuário já validou a OAB antes, mostrar no topo do formulário:
> "Última validação: 15/07/2026 às 14:32. Se seus dados profissionais não mudaram, você não precisa validar de novo."

Reduz fricção e educa o usuário.

**Critérios de aceite:**
- Mensagem aparece quando há `oab_validated_at` preenchido
- Texto claro e contextual
- Não bloqueia o reenvio do formulário (caso o user queira validar de novo por outro motivo)

---

## S6 — Métrica de validações no painel admin

**Arquivo:** `src/app/(super-admin)/admin/` (criar)

**Sugestão:** No painel super-admin, mostrar:
- Quantos tenants estão `liberado` vs `aguardando_validacao` vs `suspenso`
- Quantas validações foram concluídas na última semana
- Taxa de sucesso vs rejeição
- Tempo médio de validação

Útil para monitorar a saúde do sistema e detectar problemas (ex.: se a taxa de rejeição sobe muito, pode ser que o ConfirmADV mudou o formulário).

**Critérios de aceite:**
- Painel só visível para `super_admin`
- Dados vêm de queries agregadas em `oab_validations` e `tenants`
- Atualização manual (não precisa ser realtime)

---

## S7 — Documentar o ciclo de vida do token do CS

**Arquivo:** `docs/roadmap/validacao-oab-confirmadv-cs.md` (atualizar)

**Sugestão:** Adicionar uma seção "Operação" explicando:
- Como o token é gerado (no pareamento)
- Onde fica armazenado (criptografado em `cs-pairing` no electron-store)
- Como é invalidado (revogação via Web)
- Como debugar (logs de autenticação)
- O que fazer se um dispositivo for perdido (revogar via Web)

Hoje está disperso entre migrations e código. Centralizar ajuda a responder perguntas de suporte.

**Critérios de aceite:**
- Seção "Operação" adicionada ao doc
- Cobre os 5 cenários acima
- Links para o código relevante (rotas, migrations)

---
