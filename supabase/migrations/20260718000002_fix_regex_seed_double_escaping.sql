-- Corrige bug de escaping duplo nos 3 regex de seed criados em
-- 20260716000000_foundation_schema.sql.
--
-- Causa raiz: a migration original escreveu os patterns com aspas simples
-- padrão (`'Prazo:?\\s+(\\d+)\\s+dias?'`), assumindo que `\\` viraria `\`
-- (como em JS). Mas em string literal padrão do Postgres (sem prefixo `E`),
-- backslash NÃO é caractere de escape — `\\` é armazenado literalmente como
-- DOIS backslashes, não um. O regex resultante ficava procurando por um
-- backslash literal seguido de "s"/"d", em vez da classe de caractere
-- \s (espaço) / \d (dígito) — nunca casava com nada.
--
-- Achado testando a Parte 3 (Engine) de verdade contra o banco real: nenhum
-- dos 3 regex de seed batia com nenhum texto, mesmo os mais óbvios.
--
-- Fix: usa dollar-quoting ($$...$$), que trata backslash sempre como
-- caractere literal, sem ambiguidade — forma correta de escrever regex em
-- SQL daqui pra frente.

update public.regex_metadata
set pattern = $$Prazo:?\s+(\d+)\s+dias?$$
where name = 'prazo_dias_explicito' and created_by = 'seed';

update public.regex_metadata
set pattern = $$em\s+(\d+)\s+horas?$$
where name = 'prazo_horas' and created_by = 'seed';

update public.regex_metadata
set pattern = $$[Vv]alor\s+da\s+Causa:?\s+R\$\s*([\d.,]+)$$
where name = 'valor_causa' and created_by = 'seed';
