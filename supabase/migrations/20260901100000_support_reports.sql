-- =============================================================
-- Tabela de reports de suporte (Ajuda)
-- Tenant reporta bugs, sugestões ou dúvidas → super admin recebe
-- =============================================================

CREATE TABLE public.support_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  user_name     TEXT NOT NULL,
  user_email    TEXT,
  report_type   TEXT NOT NULL CHECK (report_type IN ('bug', 'sugestao', 'duvida')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  screenshot_url TEXT,
  page_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_andamento', 'respondido', 'arquivado')),
  answer        TEXT,
  answered_at   TIMESTAMPTZ,
  answered_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_support_reports_tenant ON public.support_reports(tenant_id);
CREATE INDEX idx_support_reports_status ON public.support_reports(status);
CREATE INDEX idx_support_reports_created ON public.support_reports(created_at DESC);

-- RLS: tenant vê os seus, super admin vê todos
ALTER TABLE public.support_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_reports_tenant_all" ON public.support_reports
FOR ALL TO authenticated
USING (
  tenant_id = public.current_user_tenant_id()
  OR public.is_super_admin()
)
WITH CHECK (
  tenant_id = public.current_user_tenant_id()
  OR public.is_super_admin()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_support_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_reports_updated_at
  BEFORE UPDATE ON public.support_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_support_reports_updated_at();
