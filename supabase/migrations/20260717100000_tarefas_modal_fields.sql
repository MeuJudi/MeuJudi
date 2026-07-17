-- Adiciona campos necessários para o modal de tarefas completo
-- parent_task_id: subtarefas (hierarquia)
-- checklist: itens de checklist (JSONB)
-- comments: comentários (JSONB)
-- attachments: anexos (JSONB)
-- assigned_to: múltiplos responsáveis (uuid array)

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tarefas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_to uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Índice para buscar subtarefas rapidamente
CREATE INDEX IF NOT EXISTS idx_tarefas_parent ON public.tarefas(parent_task_id) WHERE parent_task_id IS NOT NULL;
