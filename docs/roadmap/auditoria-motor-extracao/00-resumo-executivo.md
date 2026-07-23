# 00 — Auditoria do motor de Regex + IA: resumo executivo

> **Data:** 23/07/2026
> **Escopo:** todo o motor de extração (`src/lib/regex/`, `src/lib/ia/`,
> `src/lib/extracao/`) e seus consumidores (`poll-datajud`, `poll-mural`,
> fila de lote, Central de Revisão, painel `/admin/motor-extracao`).
> **Método:** leitura completa de cada arquivo relevante + grep sistemático
> em todo `src/` pra confirmar (não supor) o que está ou não conectado.

---

## Por que esta auditoria existe

O Sprint 2 (DataJud, Mural, conexão com o motor) já estava funcionando de
ponta a ponta em produção quando surgiu a dúvida: será que o motor de
Regex+IA em si — construído antes, no que os comentários do código chamam
de "Sprint 1" — está de fato correto e completamente conectado, ou tem
pontas soltas que só apareceriam sob uso real? Esta pasta documenta o que a
auditoria encontrou, um arquivo por achado, cada um com o que está
acontecendo, a solução recomendada, e o passo a passo de implementação.

## O que está sólido (não precisa de ação)

- **`engine.ts` + `regex_metadata`**: sistema de 3 estados (novo → quente →
  confiável), com amostragem de validação por IA proporcional ao estado, e
  transições reais implementadas em SQL (`check_regex_transition`),
  efetivamente chamadas pelo TypeScript — não é decorativo.
- **Proteção contra ReDoS**: 3 camadas de defesa (pré-filtro estrutural,
  `safe-regex` como aviso, execução real em worker thread com timeout
  genuíno) — verificada tanto na hora de aprender um regex novo quanto em
  **toda** execução contra texto de usuário, não só na criação.
- **Central de Revisão → golden dataset → `regex_metadata`**: o ciclo de
  aprendizado (não o de aplicar o dado no processo — ver achado 09) fecha
  corretamente via RPCs `security definer`.
- **RLS**: 100% das tabelas novas do projeto (38 conferidas) têm RLS
  habilitado — não há vazamento de dado entre tenants por ausência de RLS
  em lugar nenhum.
- **Custo calculado com tokens reais** da resposta da API, não estimativa
  fixa (exceto na falha específica do achado 07).

## Índice dos achados

| # | Arquivo | Severidade | Resumo em uma linha |
|---|---|---|---|
| 1 | [01-fila-lote-beco-sem-saida.md](01-fila-lote-beco-sem-saida.md) | 🔴 Crítica | Resultado do processamento em lote é gravado e nunca mais lido por ninguém — dado pago e perdido |
| 2 | [02-pollers-sempre-classificam-lote.md](02-pollers-sempre-classificam-lote.md) | 🔴 Crítica | DataJud e Mural sempre mandam contexto de urgência zerado — tudo cai no beco sem saída do achado 1 |
| 3 | [03-rls-update-policies-admin.md](03-rls-update-policies-admin.md) | 🔴 Crítica | 5 das 6 ações manuais do painel admin (inclusive o kill switch) falham silenciosamente por falta de policy de RLS |
| 4 | [04-lgpd-anonimizacao-ausente.md](04-lgpd-anonimizacao-ausente.md) | 🔴 Crítica | Nenhuma anonimização de CPF/nome/telefone antes de mandar texto real pra API da Anthropic |
| 5 | [05-campos-valor-oab-sem-ia.md](05-campos-valor-oab-sem-ia.md) | 🔴 Crítica | Campos "valor" e "oab" existem no tipo/schema mas não têm implementação de IA nenhuma |
| 6 | [06-guard-custo-entre-camadas.md](06-guard-custo-entre-camadas.md) | 🟡 Moderada | Teto de custo só é checado uma vez por chamada, não entre Camada 3 e Camada 4 |
| 7 | [07-custo-subestimado-em-falha-parsing.md](07-custo-subestimado-em-falha-parsing.md) | 🟡 Moderada | Custo vira `0` no registro quando a IA responde mas o JSON não parseia |
| 8 | [08-patterns-ts-motor-paralelo.md](08-patterns-ts-motor-paralelo.md) | 🟡 Moderada | Existe um segundo motor de regex, hardcoded e não rastreado, duplicando o oficial |
| 9 | [09-correcao-humana-nao-propaga.md](09-correcao-humana-nao-propaga.md) | 🟡 Moderada | Confirmar/corrigir na Central de Revisão ensina o regex, mas não atualiza o processo do advogado |
| 10 | [10-regex-metadata-campo-nullable.md](10-regex-metadata-campo-nullable.md) | 🟢 Menor | Coluna `campo` pode ficar nula e criar regex invisível, sem erro |
| 11 | [11-codigo-orfao-ajustes-menores.md](11-codigo-orfao-ajustes-menores.md) | 🟢 Menor | Tarefas/prompt de IA sem chamador, sem timeout customizado, cache perdendo oportunidade |

## Ordem de ataque recomendada

1. **01 + 02 juntos** — são duas causas do mesmo efeito (dado processado e
   perdido); corrigir um sem o outro não resolve o problema de verdade.
2. **03** — o kill switch do admin não funcionar é um risco operacional
   (se um regex ruim precisar ser desligado às pressas, hoje o botão não
   faz nada).
3. **04** — compliance, não é bloqueante tecnicamente, mas quanto mais
   volume passar pelo pipeline sem isso, maior o histórico de dado exposto
   acumulado.
4. **05** — decisão de produto primeiro (precisa mesmo de OAB via IA?),
   implementação depois.
5. **06, 07, 08, 09** — moderados, sem urgência de data, mas valem entrar
   no próximo ciclo de trabalho no motor.
6. **10, 11** — baixo esforço, podem ser feitos a qualquer momento, inclusive
   junto de qualquer um dos itens acima.
