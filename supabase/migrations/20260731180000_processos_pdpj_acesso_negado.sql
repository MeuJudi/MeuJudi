-- Processo cadastrado manualmente (source_context='tenant') pode nao ser
-- reconhecido pelo PDPJ como vinculado a OAB do escritorio — o Portal
-- devolve 401 com "Usuário não possui acesso ao processo X" (achado
-- 31/07/2026, via log real: 4 processos assim ficavam re-tentando pra
-- sempre, e cada 401 ainda por cima derrubava o Bearer que estava
-- funcionando, ver commit do fix no lado do CS).
--
-- Esse campo marca "o PDPJ já disse que não temos acesso a esse processo"
-- pra poll-pdpj-detalhes/poll-pdpj-urgentes pararem de recriar tarefa pra
-- ele pra sempre. Não é definitivo (substabelecimento pode mudar isso no
-- futuro) — só evita reprocessar às cegas; ninguém força reset automático
-- por enquanto.
alter table public.processos
  add column if not exists pdpj_acesso_negado_em timestamptz;

comment on column public.processos.pdpj_acesso_negado_em is
  'Quando o PDPJ respondeu "sem acesso a este processo" pra ultima tentativa (Bearer valido, só esse CNJ negado) — poll-pdpj-detalhes/poll-pdpj-urgentes param de recriar tarefa pra ele enquanto isso estiver preenchido.';
