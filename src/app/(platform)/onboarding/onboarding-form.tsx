"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Loader2,
  Upload,
  X,
  Users,
} from "lucide-react";
import { completeOnboarding, uploadAvatar, createInvites } from "./actions";
import { maskCnpj, maskPhone, maskOab, stripMask } from "@/lib/masks";
import { roleLabel } from "@/lib/auth/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

const roleLabels: Record<string, string> = {
  lawyer: roleLabel("lawyer"),
  intern: roleLabel("intern"),
  staff: roleLabel("staff"),
  owner: roleLabel("owner"),
};

type Step = 1 | 2 | 3 | "success";

type FormFields = {
  tenant_name: string;
  cnpj: string;
  city: string;
  state: string;
  phone: string;
  user_name: string;
  oab_number: string;
  oab_uf: string;
  gender: "masculine" | "feminine" | "neutral";
  avatar_url: string;
};

type Invite = {
  email: string;
  role: string;
};

type Props = {
  initialData: FormFields;
};

function Stepper({ step }: { step: Step }) {
  if (step === "success") return null;

  const steps = [
    { num: 1, label: "Escritório" },
    { num: 2, label: "Seus dados" },
    { num: 3, label: "Equipe" },
  ];

  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                step >= s.num
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
            </div>
            <span
              className={`text-sm font-medium ${
                step >= s.num ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-1 h-px w-8 ${
                step > s.num ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function OnboardingForm({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormFields>(initialData);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("lawyer");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateField(field: keyof FormFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNext() {
    if (!form.tenant_name.trim()) {
      setError("Preencha o nome do escritório.");
      return;
    }
    if (!form.user_name.trim()) {
      setError("Preencha seu nome.");
      return;
    }
    setError(null);
    setStep(2);
  }

  function handleBack() {
    setError(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  }

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
      updateField("avatar_url", result.url);
    } catch {
      setAvatarPreview(null);
      setError("Erro ao fazer upload da imagem. Tente novamente.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function addInvite() {
    if (!inviteEmail.trim()) {
      setError("Digite o email do convidado.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      setError("Email inválido.");
      return;
    }

    if (invites.some((i) => i.email === inviteEmail.toLowerCase())) {
      setError("Este email já foi adicionado.");
      return;
    }

    setInvites((prev) => [...prev, { email: inviteEmail.toLowerCase(), role: inviteRole }]);
    setInviteEmail("");
    setError(null);
  }

  function removeInvite(email: string) {
    setInvites((prev) => prev.filter((i) => i.email !== email));
  }

  async function handleSubmit() {
    setError(null);

    const formData = new FormData();
    formData.set("tenant_name", form.tenant_name);
    formData.set("user_name", form.user_name);
    formData.set("city", form.city);
    formData.set("state", form.state);
    formData.set("oab_number", stripMask(form.oab_number));
    formData.set("oab_uf", form.oab_uf);
    formData.set("gender", form.gender);
    formData.set("phone", stripMask(form.phone));
    formData.set("cnpj", stripMask(form.cnpj));

    startTransition(async () => {
      const result = await completeOnboarding(formData);
      if (!result.success) {
        setError(result.error ?? "Erro ao criar escritório. Tente novamente.");
        return;
      }

      if (invites.length > 0) {
        await createInvites(invites);
      }

      setStep("success");
      setTimeout(() => {
        router.push("/monitoramento");
      }, 2500);
    });
  }

  if (step === "success") {
    return (
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)]">
            <CheckCircle2 className="h-7 w-7 text-[var(--tenant-moss)]" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Seu escritório está pronto!
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            {form.tenant_name} foi criado com sucesso.
          </p>
          {invites.length > 0 && (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {invites.length} convite{invites.length > 1 ? "s" : ""}{" "}
              {invites.length > 1 ? "foram enviados" : "foi enviado"}.
            </p>
          )}
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Redirecionando para o painel...
          </p>
          <Button asChild className="mt-6">
            <a href="/monitoramento">Ir para o painel agora</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-8 sm:p-10">
        <Stepper step={step} />

        {error ? (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) handleNext();
            else if (step === 2) setStep(3);
            else if (step === 3) handleSubmit();
          }}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          {/* ===== STEP 1 — Dados do Escritório ===== */}
          {step === 1 && (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tenant_name">Nome do escritório *</Label>
                <Input
                  id="tenant_name"
                  required
                  value={form.tenant_name}
                  onChange={(e) => updateField("tenant_name", e.target.value)}
                  placeholder="Ex.: Silva Advocacia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => updateField("cnpj", maskCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => updateField("phone", maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="Ex.: Curitiba"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">UF</Label>
                <select
                  id="state"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">UF</option>
                  {ufs.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ===== STEP 2 — Seus Dados ===== */}
          {step === 2 && (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome do escritório</Label>
                <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                  {form.tenant_name}
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="user_name">Seu nome *</Label>
                <Input
                  id="user_name"
                  required
                  value={form.user_name}
                  onChange={(e) => updateField("user_name", e.target.value)}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oab_number">OAB principal</Label>
                <Input
                  id="oab_number"
                  value={form.oab_number}
                  onChange={(e) => updateField("oab_number", maskOab(e.target.value))}
                  placeholder="Número da OAB"
                  inputMode="numeric"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oab_uf">UF da OAB</Label>
                <select
                  id="oab_uf"
                  value={form.oab_uf}
                  onChange={(e) => updateField("oab_uf", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">UF</option>
                  {ufs.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gender">Como deseja ser identificado?</Label>
                <select
                  id="gender"
                  value={form.gender}
                  onChange={(e) => updateField("gender", e.target.value as FormFields["gender"])}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="neutral">Forma neutra</option>
                  <option value="masculine">Masculino</option>
                  <option value="feminine">Feminino</option>
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Foto do perfil</Label>
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-input bg-muted/50">
                    {avatarPreview || form.avatar_url ? (
                      <img
                        src={avatarPreview || form.avatar_url}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                      />
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
                  <div className="text-sm text-[var(--color-muted-foreground)]">
                    <p>Opcional. Avatar para comunicações internas.</p>
                    <p>Formatos: PNG, JPG. Máximo: 2MB.</p>
                  </div>
                </div>
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingAvatar ? "Enviando..." : "Escolher imagem"}
                </Button>
              </div>
            </>
          )}

          {/* ===== STEP 3 — Equipe ===== */}
          {step === 3 && (
            <>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-display text-lg font-semibold">Sua equipe</h3>
                </div>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Convide sócios ou advogados para seu escritório. Você pode pular esta etapa.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Nome do escritório</Label>
                <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                  {form.tenant_name}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite_email">Email do convidado</Label>
                <Input
                  id="invite_email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInvite();
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite_role">Papel</Label>
                <select
                  id="invite_role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="lawyer">Advogado(a)</option>
                  <option value="intern">Estagiário(a)</option>
                  <option value="staff">Equipe administrativa</option>
                  <option value="owner">Sócio(a) / Responsável</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <Button type="button" variant="outline" size="sm" onClick={addInvite}>
                  + Adicionar
                </Button>
              </div>

              {invites.length > 0 && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Convites adicionados ({invites.length})</Label>
                  <div className="rounded-md border border-input divide-y">
                    {invites.map((inv) => (
                      <div
                        key={inv.email}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium">{inv.email}</span>
                          <span className="ml-2 text-muted-foreground">
                            {roleLabels[inv.role] ?? inv.role}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeInvite(inv.email)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== Botões ===== */}
          <div className="flex gap-3 sm:col-span-2">
            {step >= 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isPending}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )}
            <Button className="flex-1" type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando escritório...
                </>
              ) : step === 1 ? (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : step === 2 ? (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Criar escritório e entrar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
