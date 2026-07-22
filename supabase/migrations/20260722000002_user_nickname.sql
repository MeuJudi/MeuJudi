alter table public.users
  add column if not exists nickname text;

comment on column public.users.nickname is
  'Nome curto preferido para exibicao nas telas internas.';
