-- Permitir super_admin criar validação OAB para qualquer membro de qualquer tenant.
-- A política atual exigia tenant_id = current_user_tenant_id(), que retorna NULL
-- para super_admin, bloqueando silenciosamente o insert.

DROP POLICY IF EXISTS "oab_validations_insert" ON public.oab_validations;
CREATE POLICY "oab_validations_insert" ON public.oab_validations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    tenant_id = public.current_user_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.is_owner()
    )
  )
);
