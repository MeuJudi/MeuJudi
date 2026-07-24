-- Link de videoconferência (Zoom/Google Meet/Teams) extraído do texto da
-- comunicação do Mural — achado revisando dados reais, 24/07/2026: o link
-- de sala de audiência aparece em texto puro em várias comunicações do
-- TRT9/TRT2, mas não ia pra nenhum campo estruturado (ficava perdido dentro
-- do texto bruto, o advogado tinha que catar no meio do texto).

alter table public.comunicacoes_mural
  add column if not exists link_videoconferencia text;

alter table public.agenda_eventos
  add column if not exists link_videoconferencia text;
