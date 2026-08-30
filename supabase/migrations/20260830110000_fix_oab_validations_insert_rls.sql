-- Permitir owner criar validação OAB para qualquer membro do tenant.
-- A política original exigia user_id = auth.uid(), bloqueando o owner
-- ao tentar criar validação para um membro da equipe.

DROP POLICY IF EXISTS "oab_validations_insert" ON public.oab_validations;
CREATE POLICY "oab_validations_insert" ON public.oab_validations
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.current_user_tenant_id()
  AND (
    user_id = auth.uid()
    OR public.is_owner()
  )
);
