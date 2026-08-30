-- Corrigir TODAS as FKs que bloqueiam exclusão de usuário
-- Adiciona ON DELETE SET NULL em colunas de auditoria que faltavam

-- processos
ALTER TABLE public.processos
  DROP CONSTRAINT IF EXISTS processos_responsavel_id_fkey,
  ADD CONSTRAINT processos_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.processos
  DROP CONSTRAINT IF EXISTS processos_created_by_fkey,
  ADD CONSTRAINT processos_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.processos
  DROP CONSTRAINT IF EXISTS processos_updated_by_fkey,
  ADD CONSTRAINT processos_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- clientes
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_created_by_fkey,
  ADD CONSTRAINT clientes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- movimentacoes
ALTER TABLE public.movimentacoes
  DROP CONSTRAINT IF EXISTS movimentacoes_visto_por_fkey,
  ADD CONSTRAINT movimentacoes_visto_por_fkey
  FOREIGN KEY (visto_por) REFERENCES public.users(id) ON DELETE SET NULL;

-- kanban columns
ALTER TABLE public.process_kanban_columns
  DROP CONSTRAINT IF EXISTS process_kanban_columns_created_by_fkey,
  ADD CONSTRAINT process_kanban_columns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.client_kanban_columns
  DROP CONSTRAINT IF EXISTS client_kanban_columns_created_by_fkey,
  ADD CONSTRAINT client_kanban_columns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.task_kanban_columns
  DROP CONSTRAINT IF EXISTS task_kanban_columns_created_by_fkey,
  ADD CONSTRAINT task_kanban_columns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- tarefas
ALTER TABLE public.tarefas
  DROP CONSTRAINT IF EXISTS tarefas_created_by_fkey,
  ADD CONSTRAINT tarefas_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
