"use client";

import { useState, useTransition } from "react";
import { Loader2, X, MailPlus } from "lucide-react";
import {
  updateMemberRole,
  deactivateMember,
  removeMember,
  revokeInvite,
  createInviteMember,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/auth/labels";

const roleLabels: Record<string, string> = {
  owner: roleLabel("owner"),
  lawyer: roleLabel("lawyer"),
  intern: roleLabel("intern"),
  staff: roleLabel("staff"),
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  last_login_at: string | null;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  invited_by_name: string | null;
};

type Props = {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
};

export function EquipeForm({ members, invites, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("lawyer");

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("email", inviteEmail);
    formData.set("role", inviteRole);

    startTransition(async () => {
      try {
        await createInviteMember(formData);
        setInviteEmail("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao enviar convite.");
      }
    });
  }

  function handleRoleChange(userId: string, newRole: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updateMemberRole(userId, newRole);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao alterar papel.");
      }
    });
  }

  function handleDeactivate(userId: string) {
    if (!confirm("Tem certeza que deseja desativar este membro?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deactivateMember(userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao desativar membro.");
      }
    });
  }

  function handleRemove(userId: string) {
    if (!confirm("Tem certeza que deseja remover este membro do escritório?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao remover membro.");
      }
    });
  }

  function handleRevokeInvite(inviteId: string) {
    if (!confirm("Tem certeza que deseja revogar este convite?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeInvite(inviteId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao revogar convite.");
      }
    });
  }

  const activeMembers = members.filter((m) => m.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Equipe</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Gerencie os membros do seu escritório e convites pendentes.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          Operação realizada com sucesso!
        </div>
      )}

      {/* Membros ativos */}
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-6">
          <h3 className="mb-4 font-medium text-[var(--color-card-foreground)]">Membros ativos ({activeMembers.length})</h3>
          <div className="divide-y rounded-md border border-[var(--tenant-line)]">
            {activeMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tenant-surface-muted)] text-sm font-medium text-[var(--tenant-brass)]">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-card-foreground)]">
                      {member.name}
                      {member.id === currentUserId && (
                        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">(você)</span>
                      )}
                    </p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={isPending || member.id === currentUserId}
                    className="h-8 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 text-xs text-[var(--color-card-foreground)]"
                  >
                    <option value="owner">Responsável</option>
                    <option value="lawyer">Advogado(a)</option>
                    <option value="intern">Estagiário(a)</option>
                    <option value="staff">Equipe administrativa</option>
                  </select>
                  {member.id !== currentUserId && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(member.id)}
                        disabled={isPending}
                        className="h-8 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]"
                      >
                        Desativar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(member.id)}
                        disabled={isPending}
                        className="h-8 text-xs text-[var(--color-muted-foreground)] hover:text-destructive"
                      >
                        Remover
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Convidar membro */}
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <MailPlus className="h-5 w-5 text-[var(--tenant-brass)]" />
            <h3 className="font-medium text-[var(--color-card-foreground)]">Convidar membro</h3>
          </div>
          <form onSubmit={handleInvite} className="flex gap-3">
            <div className="flex-1">
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
                required
              />
            </div>
            <div className="w-44">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-1 text-sm text-[var(--color-card-foreground)] shadow-sm transition-colors placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tenant-brass)]"
              >
                <option value="lawyer">Advogado(a)</option>
                <option value="intern">Estagiário(a)</option>
                <option value="staff">Equipe administrativa</option>
                <option value="owner">Sócio(a) / Responsável</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar convite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Convites pendentes */}
      {invites.length > 0 && (
        <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
          <CardContent className="p-6">
            <h3 className="mb-4 font-medium text-[var(--color-card-foreground)]">Convites pendentes ({invites.length})</h3>
            <div className="divide-y rounded-md border border-[var(--tenant-line)]">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-[var(--color-card-foreground)]">{invite.email}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {roleLabels[invite.role] ?? invite.role} · Enviado por{" "}
                      {invite.invited_by_name ?? "desconhecido"} · Expira em{" "}
                      {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-[var(--tenant-line)] bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)] text-[var(--tenant-brass)]"
                    >
                      {invite.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeInvite(invite.id)}
                      disabled={isPending}
                      className="text-[var(--color-muted-foreground)] hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
