# 09 — Correção humana não propaga pro processo real

> **Severidade:** 🟡 Moderada
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

Quando um advogado usa a Central de Revisão (`/monitoramento/revisao`) pra
**confirmar** ou **corrigir** um item, o fluxo (`src/app/(platform)/(tenant)/monitoramento/revisao/actions.ts`)
faz o seguinte:

```ts
export async function confirmarItemRevisao(itemId: string) {
  ...
  await supabase.from("itens_revisao").update({
    status: "confirmado",
    valor_final: item.valor_sugerido,
    revisado_em: new Date().toISOString(),
  }).eq("id", itemId);

  await registrarCorrecaoComoAprendizado(supabase, item, item.valor_sugerido ?? {}, true);
  revalidatePath("/monitoramento/revisao");
}
```

`registrarCorrecaoComoAprendizado` faz 3 coisas — todas sobre **aprendizado
do motor**, nenhuma sobre **aplicar o dado no processo do advogado**:
1. `registrarValidacao` (se veio de um regex) → atualiza métricas +
   transição de estado em `regex_metadata`.
2. Insere em `golden_dataset_casos`.
3. Loga em `motor_extracao_log`.

O `valor_final` — que é exatamente o prazo/audiência/valor **correto**, seja
porque o advogado confirmou o que a IA sugeriu, seja porque ele digitou a
correção manualmente — fica salvo **só dentro da linha de `itens_revisao`**.
Nada escreve esse valor de volta em `processos.prazo_proxima_resposta`, nem
cria/atualiza o evento correspondente em `agenda_eventos`.

### Por que isso é um problema prático

O objetivo inteiro da Central de Revisão é: "a IA não teve certeza, o
advogado confirma ou corrige, e o sistema usa esse dado certo". Hoje a
segunda metade não acontece — o sistema fica mais esperto (o regex aprende),
mas **o processo específico que gerou aquele item de revisão não é
atualizado com o dado correto**. Na prática, o advogado corrige um prazo na
tela de revisão, e esse prazo continua não aparecendo na agenda dele.

---

## Qual a solução

Depois de marcar `itens_revisao` como confirmado/corrigido, aplicar
`valor_final` no processo — usando a mesma lógica que os pollers automáticos
já usam quando acham o prazo por conta própria (`calcularPrazoFatal` +
update em `processos` + insert em `agenda_eventos`).

Isso é o mesmo ponto de centralização que o doc
[`01-fila-lote-beco-sem-saida.md`](01-fila-lote-beco-sem-saida.md) já
recomenda criar (`src/lib/prazo/aplicar-prazo.ts`) — vale implementar os
dois fixes juntos, já que compartilham a mesma função utilitária.

```ts
export async function confirmarItemRevisao(itemId: string) {
  const { supabase } = await requireAppUser();
  const item = await buscarItem(supabase, itemId);
  if (!item) throw new Error("Item de revisão não encontrado");

  await supabase.from("itens_revisao").update({
    status: "confirmado",
    valor_final: item.valor_sugerido,
    revisado_em: new Date().toISOString(),
  }).eq("id", itemId);

  await aplicarValorFinalNoProcesso(supabase, item, item.valor_sugerido ?? {}); // NOVO
  await registrarCorrecaoComoAprendizado(supabase, item, item.valor_sugerido ?? {}, true);
  revalidatePath("/monitoramento/revisao");
}
```

`aplicarValorFinalNoProcesso` precisa lidar com o shape de `valor_final`
variando por `campo` (`prazo` tem `prazo_dias`/`data_audiencia`, `valor` tem
um número, etc — hoje só `prazo` está de fato em uso, ver doc 05).

---

## Como implementar

**Arquivo novo (compartilhado com o doc 01):** `src/lib/prazo/aplicar-prazo.ts`
```ts
export async function aplicarPrazoEncontrado(
  supabase: SupabaseClient,
  params: { tenantId: string; processoId: string; prazoDias: number; dataReferencia: Date; fonte: string; fonteId?: string },
): Promise<void> {
  const dataFatal = calcularPrazoFatal(params.dataReferencia, params.prazoDias);
  await supabase.from("processos").update({ prazo_proxima_resposta: dataFatal }).eq("id", params.processoId);
  await supabase.from("agenda_eventos").upsert({
    tenant_id: params.tenantId,
    processo_id: params.processoId,
    tipo: "prazo",
    titulo: `Prazo: ${params.prazoDias} dias`,
    data_inicio: dataFatal,
    fonte: params.fonte,
    fonte_id: params.fonteId ?? null,
  }, { onConflict: "tenant_id,fonte,fonte_id" });
}
```

**`src/app/(platform)/(tenant)/monitoramento/revisao/actions.ts`** — chamar
essa função (com `fonte: 'revisao_humana'`) dentro de `confirmarItemRevisao`
e `corrigirItemRevisao`, usando `item.processo_id` (já disponível no objeto
`ItemRevisao` lido no início da action) e o `valor_final`/`valorCorrigido`
correspondente.

**Ponto de atenção:** como o `campo` pode não ser `'prazo'` (mesmo que hoje
na prática sempre seja, por causa do achado do doc 05), a função deveria
checar `item.campo === 'prazo'` antes de tentar extrair `prazo_dias` do
valor — pra `valor`/`audiencia`/`oab`, a lógica de aplicação seria
diferente (ou nem existe ainda, dependendo do que o doc 05 decidir).

**Teste de verificação:**
1. Criar (ou aguardar) um item de revisão real com `campo: 'prazo'`.
2. Confirmar ou corrigir pela UI.
3. Consultar `processos.prazo_proxima_resposta` do processo relacionado —
   deve refletir o valor confirmado/corrigido, não o valor antigo (ou nulo).
4. Consultar `agenda_eventos` — deve ter um evento novo ou atualizado com
   `fonte: 'revisao_humana'` e a data certa.
