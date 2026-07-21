-- Limpeza pontual dos processos criados pelo antigo botao de demonstracao.
-- Execute no SQL Editor do projeto Supabase depois de conferir a lista.
-- Movimentacoes e agenda_eventos relacionadas sao removidas por ON DELETE CASCADE.

begin;

delete from public.processos
where cnj in (
  '10000012320268260001',
  '10000024520264030000',
  '10000036720255020001',
  '10000048920268190001',
  '10000050120268070001',
  '10000062320258260002',
  '10000074520266040000',
  '10000086720255090001',
  '10000098920258080001',
  '10000110120268130024',
  '10000122320268050001',
  '10000134520259010000',
  '10000146720268240001',
  '10000158920267030000',
  '10000160120268060001'
);

commit;
