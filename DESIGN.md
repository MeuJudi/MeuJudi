# Design

## Source

Visual system based on `C:\Users\User\Downloads\MeuJudi_Demo.html`.

## Tone

Product UI sobria, juridica e operacional. Deve transmitir confianca sem parecer sistema antigo. A tela principal e de trabalho, nao de marketing.

## Typography

- UI/body: IBM Plex Sans.
- Data/code/CNJ: IBM Plex Mono.
- Brand and section titles: Fraunces.

Fallback:
- Sans: `"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif`
- Serif/display: `"Fraunces", Georgia, serif`
- Mono: `"IBM Plex Mono", ui-monospace, monospace`

## Color Tokens

Use the demo palette as the MeuJudi tenant app identity.

- Ink: `#16233A`
- Ink 2: `#1F3350`
- Paper: `#EDE9DD`
- Paper 2: `#F6F3EA`
- Brass: `#B8863B`
- Brass light: `#D9B372`
- Wine: `#7A2E2E`
- Moss: `#4B6B4E`
- Text: `#1A1A1A`
- Text soft: `#5B5548`
- Line: `#D9D2BF`
- Surface: `#FFFFFF`

## App Shell

- Sidebar fixa em desktop, fundo `Ink`, largura aproximada de 230px.
- Conteudo em `Paper 2`.
- Cards e tabelas em branco com borda `Line`.
- Item ativo da sidebar usa destaque `Brass`.
- Em mobile, sidebar vira barra horizontal com icones.

## Components

- Process card: branco, borda fina, CNJ em mono, titulo em Ink, metadados em Text soft.
- Tags: tribunal, status e prioridade com fundos suaves.
- Agenda: calendario mensal com cabecalho Ink e eventos coloridos por tipo.
- Kanban: colunas discretas, cards compactos, prioridade por Wine/Brass/Moss.
- Tabelas: cabecalho pequeno, uppercase leve, linhas com hover discreto.
- Configuracoes: lista de secoes com rows e toggles simples.

## States

- Novo/urgente: Wine.
- Em andamento/media prioridade: Brass.
- Ativo/concluido/baixo risco: Moss.
- Neutro/tribunal: Ink.
- Linha/divisoria: Line.

## Motion

Motion curta, 150-250ms, apenas para hover, troca de view e feedback. Respeitar `prefers-reduced-motion`.
