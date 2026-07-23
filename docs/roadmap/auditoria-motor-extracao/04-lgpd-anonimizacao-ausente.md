# 04 — Nenhuma anonimização de texto antes de mandar pra IA

> **Severidade:** 🔴 Crítica (compliance, não é bug funcional)
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

Toda chamada de IA do pipeline principal (Camada 3 — `confirmadora.ts`,
Camada 4 — `generalista.ts`, Camada 5 — `aprender-regex.ts`) manda o texto
real da movimentação/comunicação processual pra API da Anthropic **sem
nenhuma remoção de dado pessoal**.

Busquei a palavra "anonimiz" em todo `src/lib/ia/` e `src/lib/extracao/` —
**zero ocorrências**. Os 4 prompts em `src/lib/ia/prompts.ts`
(`validarRegex`, `extrairPrazo`, `sugerirRegex`, `classificarIntimacao`)
interpolam `texto` direto na string:
```ts
// exemplo de extrairPrazo
`TEXTO: "${texto}"`
```

### De onde vem esse texto, na prática

- **DataJud** (`poll-datajud/route.ts`): `textoCompleto` = nome da
  movimentação + complementos tabelados. Menos risco (movimentação do
  DataJud já vem sem partes/CPF por design da própria API pública, conforme
  você mesmo descobriu na pesquisa de julho — "NÃO tem: partes, CPF/CNPJ,
  advogados, removidos por proteção LGPD").
- **Mural** (`processar-comunicacao.ts`): `com.texto` = texto real da
  intimação/comunicação, que **pode conter nome de partes, nome de
  advogados, e em textos mais completos, CPF/CNPJ**. Esse é o caminho de
  maior risco.

### O que é persistido, não só transmitido

O texto de exemplo usado pela Camada 5 fica salvo em
`regex_metadata.texto_exemplo` (`aprender-regex.ts`, linha ~93), **sem
anonimização** — ou seja, mesmo depois da chamada de IA terminar, o dado
pessoal pode continuar armazenado no seu próprio banco, visível pra qualquer
super admin que abra a tela de edição de regex.

### Por que isso não é "só um detalhe do CS"

O doc `docs/roadmap/09-cert-a1.md` já documenta uma função `anonimizar()`
como requisito — mas só no contexto do parser de PDF do CS (PJe). Essa
função **não existe em lugar nenhum do código hoje**, nem lá nem aqui. E o
pipeline principal (DataJud/Mural), que é o caminho de **maior volume** do
sistema (roda automaticamente, todo dia, pra todos os tenants), não tem
proteção equivalente nenhuma implementada.

---

## Qual a solução

Implementar uma função de anonimização e aplicá-la **antes** de montar
qualquer prompt que vá pra Camada 3, 4 ou 5 — e antes de persistir
`texto_exemplo` em `regex_metadata`.

### O que precisa ser removido/mascarado

Baseado no que já está documentado como exemplo no doc do CS (adaptando pro
formato de texto do Mural, não de PDF do PJe):

```ts
function anonimizar(texto: string): string {
  return texto
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]')
    .replace(/OAB\s*\/?\s*[A-Z]{2}\s*[\d\.]+/gi, '[OAB]')
    .replace(/Rua\s+[^,]+,\s*\d+/g, 'Rua [ENDERECO]')
    .replace(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/g, '[TEL]')
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[EMAIL]');
}
```

**Nome de partes é o caso mais difícil** — não dá pra fazer isso com regex
simples de forma confiável (nomes próprios não têm um padrão sintático fixo
como CPF/CNPJ). Duas abordagens possíveis:
- **Pragmática:** já que `com.destinatarios` (Mural) já traz o nome
  estruturado separadamente (fora do texto livre), dá pra fazer um
  find-and-replace desses nomes conhecidos dentro do texto livre antes de
  montar o prompt — substitui `"João da Silva"` por `[PARTE]` em qualquer
  lugar que apareça no texto, já que você sabe exatamente quais nomes
  procurar (vieram no mesmo payload).
- **Mais robusta, mais cara:** usar um regex heurístico de "sequência de
  2+ palavras capitalizadas" (`/(?:[A-ZÀ-Ú][a-zà-ú]+\s+){1,4}[A-ZÀ-Ú][a-zà-ú]+/g`)
  como fallback pra nomes que não vieram estruturados — gera falso positivo
  (nomes de tribunal, classe processual em maiúscula também casam), mas erra
  pro lado seguro (super-anonimiza) em vez de vazar.

Recomendo a abordagem pragmática como primeira etapa (baixo custo, cobre o
caso mais comum — nome de parte que você já tem estruturado) e considerar a
heurística de fallback depois, com testes pra medir a taxa de falso positivo
antes de ativar em produção.

### Onde aplicar

- Antes de montar `TEXTO:` em qualquer um dos 4 prompts de `prompts.ts` —
  o ponto mais central é anonimizar **antes de chamar `extrairCampo`**, não
  dentro de cada camada individualmente, pra garantir que nenhuma chamada
  escape.
- Antes de `texto_exemplo: params.texto` em `aprender-regex.ts`.

---

## Como implementar

**Arquivo novo:** `src/lib/extracao/anonimizar.ts`
```ts
export function anonimizarTexto(texto: string, nomesConhecidos?: string[]): string {
  let resultado = texto;
  for (const nome of nomesConhecidos ?? []) {
    if (nome) resultado = resultado.replaceAll(nome, "[PARTE]");
  }
  return resultado
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[CPF]")
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "[CNPJ]")
    .replace(/OAB\s*\/?\s*[A-Z]{2}\s*[\d.]+/gi, "[OAB]")
    .replace(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/g, "[TEL]")
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[EMAIL]");
}
```

**`src/lib/extracao/pipeline.ts`** — chamar `anonimizarTexto` no início de
`extrairCampo`, antes de `params.texto` ser usado em qualquer camada:
```ts
const textoAnonimizado = anonimizarTexto(params.texto, params.nomesConhecidos);
```
E usar `textoAnonimizado` em vez de `params.texto` a partir daí em diante —
inclusive no que é passado pro regex do banco (`executarRegex`), já que
regex rodando contra texto anonimizado ainda funciona pra prazo/audiência
(não depende de nome/CPF), e reduz superfície de exposição mesmo nas camadas
que não são de IA.

**Chamadores** (`poll-datajud/route.ts`, `processar-comunicacao.ts`) — passar
os nomes já conhecidos (`com.destinatarios.map(d => d.nome)` no caso do
Mural) como novo parâmetro opcional `nomesConhecidos` de `extrairCampo`.

**`src/lib/ia/aprender-regex.ts`** — usar o texto já anonimizado (que
`pipeline.ts` já vai ter calculado) em `texto_exemplo`, em vez de
`params.texto` bruto.

**Migração de dado já existente:** os `texto_exemplo` já salvos em
`regex_metadata` (e `regex_historico_validacoes.texto`) de antes desse fix
continuam com dado não anonimizado. Vale rodar um script pontual (não
migration automática) pra reprocessar essas colunas com `anonimizarTexto`
depois que a função estiver pronta e testada — mas isso é decisão sua sobre
quando fazer, não bloqueia o fix em si.

**Teste de verificação:**
1. Pegar um texto real de comunicação do Mural com nome de parte e telefone.
2. Rodar `anonimizarTexto` e conferir que o resultado não contém mais o nome
   nem o telefone.
3. Confirmar (via log/print temporário, não em produção) que o prompt
   enviado pra Anthropic em `confirmadora.ts`/`generalista.ts` usa o texto
   anonimizado, não o original.
4. Confirmar que a extração de prazo/audiência continua funcionando igual
   (anonimizar não deve quebrar a detecção de data/prazo, já que esses
   padrões não são tocados pelos replaces acima).
