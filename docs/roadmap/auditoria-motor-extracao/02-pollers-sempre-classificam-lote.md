# 02 — Pollers automáticos sempre classificam como "lote"

> **Severidade:** 🔴 Crítica
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026
> **Relacionado a:** [`01-fila-lote-beco-sem-saida.md`](01-fila-lote-beco-sem-saida.md) — esta é a segunda causa do mesmo efeito (dado processado e perdido). Corrigir só este doc sem corrigir o 01 não resolve nada; corrigir só o 01 sem este doc também não resolve, porque o lote continua recebendo volume que deveria ser tempo real.

---

## O que está acontecendo

O gate de urgência (`classificarUrgencia`, `src/lib/extracao/classificador-urgencia.ts`)
decide entre `"tempo_real"` e `"lote"` olhando 3 sinais:

```ts
export interface ContextoUrgencia {
  prazoDiasDetectado?: number | null;
  dataAudienciaDetectada?: string | null;
  prioridadeLegal?: string[] | null;
}
```

- `prioridadeLegal` não vazio → tempo real
- `prazoDiasDetectado <= 5` → tempo real
- `dataAudienciaDetectada` dentro de 7 dias → tempo real
- Nenhum dos três → **lote**

Isso é uma lógica correta e bem pensada — o problema não está aqui, está em
quem alimenta esse contexto.

### Os dois únicos chamadores automáticos sempre mandam contexto vazio

**`src/app/api/cron/poll-datajud/route.ts` (linha ~187):**
```ts
} else if (movInserida) {
  // Regex simples não achou prazo — motor completo decide (Camada 0-6);
  // sem sinal de urgência conhecido aqui, cai pra fila de lote por padrão.
  await extrairCampo(supabase, {
    tenantId: tenant.id,
    processoId: processo.id,
    texto: textoCompleto,
    campo: "prazo",
    tribunal: tribunalUsado,
    contextoProcesso: { classe: fresh.classe?.nome ?? "", tribunal: tribunalUsado, tipo: mov.nome },
    contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null },
  });
}
```

**`src/lib/mural/processar-comunicacao.ts` (linha ~85):**
```ts
if (!prazoDias && !dataAudienciaIso) {
  await extrairCampo(supabase, {
    tenantId, processoId, texto: com.texto, campo: "prazo", tribunal: com.siglaTribunal ?? "",
    contextoProcesso: { classe: com.nomeClasse ?? "", tribunal: com.siglaTribunal ?? "", tipo: com.tipoComunicacao ?? "" },
    contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null },
  });
}
```

Os dois só entram nesse branch **depois de já ter tentado** achar prazo/audiência
via regex simples local (`extrairPrazoDias`, `extrairPrazoHoras`,
`extrairAudienciaV2` de `src/lib/regex/patterns.ts`) e falhado. Ou seja, o
momento exato em que mais precisaríamos que a IA pudesse classificar como
urgente (porque a regex simples já não deu conta) é justamente o momento em
que o sistema **desiste de saber se é urgente** e manda tudo pro lote — que,
como o doc 01 mostra, é hoje um buraco sem fundo.

### Por que isso é um problema mesmo sem o achado do doc 01

Mesmo que o doc 01 seja corrigido e o lote passe a fechar o ciclo, ainda
existe um problema real aqui: um processo com audiência em 2 dias, cuja
comunicação menciona a data de um jeito que a regex simples (`REGEX_AUDIENCIA_V2`)
não reconhece, vai pro lote — que pode levar **até 24h** pra responder (SLA
da Batch API da Anthropic). Um prazo/audiência genuinamente urgente correndo
o risco de só ser processado depois de já ter passado não é aceitável para
um sistema que existe pra evitar perda de prazo.

---

## Qual a solução

O `contextoUrgencia` não pode ser sempre vazio — ele precisa refletir sinais
que **já estão disponíveis** no momento da chamada, mesmo quando a regex
específica de prazo/audiência falhou.

### Sinais disponíveis que hoje são descartados

1. **Prioridade legal do processo** — se `processos` já tem informação de
   parte idosa/prioritária (verificar se esse dado existe estruturado em
   algum lugar; se não existir ainda, é um pré-requisito separado a levantar).
2. **Tipo de comunicação/movimentação** — o Mural já classifica o tipo
   (`com.tipoComunicacao`) e o DataJud tem `mov.nome` (nome da movimentação).
   Tipos como "Intimação" ou "Citação" tendem a ter prazo associado com mais
   frequência que "Certidão" ou "Despacho de mero expediente" — dá pra usar
   uma heurística leve (lista de palavras-chave em `tipoComunicacao`/`nome`
   que sinalizam "provavelmente tem prazo curto") só pra decidir
   tempo-real-vs-lote, sem precisar ser tão precisa quanto a extração final.
3. **Menção textual a prazo mesmo sem bater no regex estruturado** — um
   regex simples tipo `/\bprazo\b|\baudiência\b|\bintimação\b/i` já é um
   sinal fraco melhor que `null` fixo — não precisa ser o regex de extração
   completo (`REGEX_PRAZO_DIAS`), só uma detecção "tem chance de ser
   urgente" pra decidir a rota, não pra extrair o valor.

### Recomendação concreta

Adicionar, em ambos os pollers, um cálculo leve de `contextoUrgencia` **antes**
de decidir cair no branch de `extrairCampo`, baseado em:
- Regex fraco de "menção a prazo/audiência/intimação/urgente" no texto (novo,
  pequeno, propositalmente permissivo).
- Palavras-chave no tipo de movimentação/comunicação.

Se qualquer um desses dois sinais disparar, passar `contextoUrgencia` com um
valor que force `"tempo_real"` (ex: um novo campo opcional em
`ContextoUrgencia`, tipo `sinalFracoDeUrgencia?: boolean`, que
`classificarUrgencia` trata como equivalente a prazo curto) — mais barato e
mais rápido de implementar que tentar estimar `prazoDiasDetectado` de verdade
nesse ponto (isso é literalmente o trabalho que a Camada 4 ainda vai fazer
depois).

---

## Como implementar

**Arquivos a alterar:**

1. `src/lib/extracao/classificador-urgencia.ts` — adicionar campo opcional
   em `ContextoUrgencia`:
   ```ts
   export interface ContextoUrgencia {
     prazoDiasDetectado?: number | null;
     dataAudienciaDetectada?: string | null;
     prioridadeLegal?: string[] | null;
     sinalFracoDeUrgencia?: boolean; // novo
   }
   ```
   E tratar em `classificarUrgencia`:
   ```ts
   if (contexto.sinalFracoDeUrgencia) {
     return { classificacao: "tempo_real", motivo: "sinal_fraco_de_urgencia_no_texto" };
   }
   ```

2. Novo: `src/lib/extracao/detectar-sinal-urgencia.ts` — função pura
   `detectarSinalFracoDeUrgencia(texto: string, tipoMovimentacao?: string): boolean`,
   regex permissivo + lista de palavras-chave de tipo.

3. `src/app/api/cron/poll-datajud/route.ts` e
   `src/lib/mural/processar-comunicacao.ts` — trocar o
   `contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null }`
   fixo por:
   ```ts
   contextoUrgencia: {
     prazoDiasDetectado: null,
     dataAudienciaDetectada: null,
     sinalFracoDeUrgencia: detectarSinalFracoDeUrgencia(textoCompleto, mov.nome),
   },
   ```
   (ajustar nomes de variável conforme o arquivo).

**Depois de decidir junto com o doc 01 (é o mesmo `classificacao_urgencia_log`
que já registra cada decisão)**: monitorar por 1-2 semanas a proporção
tempo_real/lote — o comentário original em `classificador-urgencia.ts` já
avisa que os limiares (5 dias, 7 dias) são "provisórios de propósito" e
precisam de dado real de uso pra calibrar. Esse log já existe e já é
suficiente pra essa análise, não precisa de instrumentação nova.

**Teste de verificação:**
1. Pegar um texto de exemplo do Mural com "audiência" mencionada de um jeito
   que `REGEX_AUDIENCIA_V2` não reconheça (ex: formato de data não coberto).
2. Confirmar que `detectarSinalFracoDeUrgencia` retorna `true` pra esse texto.
3. Rodar `processar-comunicacao.ts` com esse caso e confirmar em
   `classificacao_urgencia_log` que a linha criada tem
   `classificacao: 'tempo_real'`, não `'lote'`.
