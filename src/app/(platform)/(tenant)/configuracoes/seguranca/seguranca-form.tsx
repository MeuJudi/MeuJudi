"use client";

import { useState, useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { changePassword, deleteAccount } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function SegurancaForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("current_password", currentPassword);
    formData.set("new_password", newPassword);
    formData.set("confirm_password", confirmPassword);

    startTransition(async () => {
      try {
        await changePassword(formData);
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao alterar senha.");
      }
    });
  }

  function handleDeleteAccount() {
    startTransition(async () => {
      try {
        await deleteAccount();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao excluir conta.");
        setShowDeleteConfirm(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Segurança</h2>
        <p className="text-sm text-muted-foreground">
          Altere sua senha e gerencie sua conta.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          Senha alterada com sucesso!
        </div>
      )}

      {/* Alterar senha */}
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-6">
          <h3 className="mb-4 font-medium">Alterar senha</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Senha atual</Label>
              <PasswordInput
                id="current_password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">Nova senha</Label>
              <PasswordInput
                id="new_password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar nova senha</Label>
              <PasswordInput
                id="confirm_password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  "Alterar senha"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h3 className="font-medium text-destructive">Zona de perigo</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Excluir sua conta é uma ação irreversível. Todos os seus dados serão removidos
                permanentemente.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Excluir minha conta
                </Button>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">
                    Tem certeza? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAccount}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Excluindo...
                        </>
                      ) : (
                        "Sim, excluir minha conta"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
