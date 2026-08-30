-- Allow owners to delete (revoke) pending invites for their tenant
create policy "tenant_invites_owner_delete" on public.tenant_invites
for delete to authenticated
using (tenant_id = public.current_user_tenant_id() and public.is_owner());
