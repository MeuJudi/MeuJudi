"use client";

import { useState, useRef } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Check } from "lucide-react";
import { updateProfile, uploadAvatar } from "../actions";
import { maskPhone, maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { palettes, type PaletteId } from "@/lib/themes/palettes";
import { roleLabel, type Gender } from "@/lib/auth/labels";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

type Props = {
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    oab_number: string | null;
    oab_uf: string | null;
    role: string;
    gender: Gender;
    avatar_url: string | null;
    created_at: string;
  };
};

export function PerfilForm({ profile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [oabNumber, setOabNumber] = useState(profile.oab_number ?? "");
  const [oabUf, setOabUf] = useState(profile.oab_uf ?? "");
  const [gender, setGender] = useState<Gender>(profile.gender ?? "neutral");
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
      const result = await uploadAvatar(formData);
      setAvatarPreview(result.url);
      router.refresh();
    } catch (err) {
      setAvatarPreview(profile.avatar_url);
      setError(err instanceof Error ? err.message : "Erro ao fazer upload da imagem.");
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
    formData.set("gender", gender);

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
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)]">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                  <Upload className="h-6 w-6" />
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--tenant-surface)]/80">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--tenant-brass)]" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-card-foreground)]">Foto do perfil</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">PNG, JPG. Máximo 2MB.</p>
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
                className="mt-2 border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Enviando..." : "Alterar foto"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name" className="text-[var(--color-card-foreground)]">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[var(--color-card-foreground)]">Email</Label>
              <div className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm text-[var(--color-card-foreground)]">
                {profile.email}
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">O email não pode ser alterado.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-[var(--color-card-foreground)]">Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--color-card-foreground)]">Papel</Label>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-[var(--tenant-line)] bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)] text-[var(--tenant-brass)]"
                >
                  {roleLabel(profile.role, gender)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender" className="text-[var(--color-card-foreground)]">Sexo</Label>
              <select id="gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-1 text-sm text-[var(--color-card-foreground)]">
                <option value="feminine">Feminino</option>
                <option value="masculine">Masculino</option>
                <option value="neutral">Prefiro não informar</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oab_number" className="text-[var(--color-card-foreground)]">OAB</Label>
              <Input
                id="oab_number"
                value={oabNumber}
                onChange={(e) => setOabNumber(maskOab(e.target.value))}
                placeholder="Número da OAB"
                inputMode="numeric"
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oab_uf" className="text-[var(--color-card-foreground)]">UF da OAB</Label>
              <select
                id="oab_uf"
                value={oabUf}
                onChange={(e) => setOabUf(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-1 text-sm text-[var(--color-card-foreground)] shadow-sm transition-colors placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tenant-brass)]"
              >
                <option value="">UF</option>
                {ufs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[var(--color-card-foreground)]">Membro desde</Label>
              <div className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm text-[var(--color-card-foreground)]">
                {new Date(profile.created_at).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
            >
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

export function AparenciaSection() {
  const [selectedPalette, setSelectedPalette] = useState<PaletteId>(() => {
    if (typeof window === "undefined") return "padrao";
    return (window.localStorage.getItem("meujudi-palette") as PaletteId | null) ?? "padrao";
  });

  function handlePaletteChange(id: PaletteId) {
    setSelectedPalette(id);
    window.localStorage.setItem("meujudi-palette", id);
    // eslint-disable-next-line react-hooks/immutability -- Persistencia intencional em cookie para SSR ler o tema.
    window.document.cookie = `meujudi-palette=${id};path=/;max-age=31536000;SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("meujudi-theme-change", { detail: { palette: id } }));
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-[var(--color-card-foreground)]">Aparência</h3>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Escolha o tema visual do sistema.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            {palettes.map((palette) => (
              <button
                key={palette.id}
                type="button"
                onClick={() => handlePaletteChange(palette.id)}
                className="group flex flex-col items-center gap-2"
              >
                <div
                  className={`relative h-12 w-12 rounded-full shadow-inner transition-all ${
                    selectedPalette === palette.id
                      ? "ring-2 ring-offset-2 ring-[var(--tenant-brass)]"
                      : "group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-[var(--tenant-brass)]/50"
                  }`}
                  style={{ background: palette.swatch }}
                >
                  {selectedPalette === palette.id && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-[var(--color-card-foreground)]">
                  {palette.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
