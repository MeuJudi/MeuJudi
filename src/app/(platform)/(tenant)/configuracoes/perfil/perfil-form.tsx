"use client";

import { useState, useRef } from "react";
import { useTransition } from "react";
import { Upload, Loader2 } from "lucide-react";
import { updateProfile, uploadAvatar } from "../actions";
import { maskPhone, maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

const roleLabel: Record<string, string> = {
  owner: "Responsável pelo escritório",
  lawyer: "Advogado(a)",
  staff: "Equipe administrativa",
  super_admin: "Administrador da plataforma",
};

type Props = {
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    oab_number: string | null;
    oab_uf: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
  };
};

export function PerfilForm({ profile }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [oabNumber, setOabNumber] = useState(profile.oab_number ?? "");
  const [oabUf, setOabUf] = useState(profile.oab_uf ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadAvatar(formData);
    } catch {
      setAvatarPreview(profile.avatar_url);
      setError("Erro ao fazer upload da imagem.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("phone", phone);
    formData.set("oab_number", oabNumber);
    formData.set("oab_uf", oabUf);

    startTransition(async () => {
      try {
        await updateProfile(formData);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar perfil.");
      }
    });
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              Perfil salvo com sucesso!
            </div>
          )}

          <div className="flex items-center gap-6">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-input bg-muted/50">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Upload className="h-6 w-6" />
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Foto do perfil</p>
              <p className="text-xs text-muted-foreground">PNG, JPG. Máximo 2MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Enviando..." : "Alterar foto"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                {profile.email}
              </div>
              <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[var(--tenant-line)]">
                  {roleLabel[profile.role] ?? profile.role}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oab_number">OAB</Label>
              <Input
                id="oab_number"
                value={oabNumber}
                onChange={(e) => setOabNumber(maskOab(e.target.value))}
                placeholder="Número da OAB"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oab_uf">UF da OAB</Label>
              <select
                id="oab_uf"
                value={oabUf}
                onChange={(e) => setOabUf(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">UF</option>
                {ufs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Membro desde</Label>
              <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                {new Date(profile.created_at).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
