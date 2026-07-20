import { MailCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resendSignupCode } from "@/app/(auth)/actions";
import { OnboardingForm } from "./onboarding-form";

function MessageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-primary">
          <MailCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold">{title}</h1>
        <div className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">{children}</div>
      </CardContent>
    </Card>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; email?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-12">
        <div className="mx-auto w-full max-w-lg">
          <MessageCard title="Confirme seu e-mail para continuar">
            <p>
              Confirme seu email com o código enviado para sua caixa de entrada antes de continuar
              a configuração do escritório.
            </p>
            <p className="mt-3">Depois da confirmação, entre novamente para continuar o cadastro.</p>
            <div className="mt-5 flex flex-col gap-3">
              <Button asChild>
                <a href="/login">Já confirmei, entrar</a>
              </Button>
              {params.email ? (
                <form action={resendSignupCode}>
                  <input type="hidden" name="email" value={params.email} />
                  <Button variant="outline" type="submit" className="w-full">
                    Reenviar código
                  </Button>
                </form>
              ) : null}
            </div>
          </MessageCard>
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.tenant_id) {
    return (
      <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-12">
        <div className="mx-auto w-full max-w-lg">
          <MessageCard title="Seu escritório já está pronto">
            <p>Seu acesso já está vinculado a um escritório. Você pode seguir para o painel.</p>
            <Button asChild className="mt-5">
              <a href="/monitoramento">Ir para o painel</a>
            </Button>
          </MessageCard>
        </div>
      </main>
    );
  }

  const metadata = user.user_metadata ?? {};
  const initialData = {
    tenant_name: String(metadata.office ?? ""),
    cnpj: "",
    city: "",
    state: "",
    phone: "",
    user_name: String(metadata.name ?? ""),
    oab_number: String(metadata.oab ?? ""),
    oab_uf: String(metadata.uf ?? ""),
    avatar_url: "",
  };

  return (
    <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="text-center">
          <p className="text-sm font-medium text-primary">Configuração inicial</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-card-foreground)]">
            Vamos preparar seu escritório
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--color-muted-foreground)]">
            Preencha os dados abaixo. Você poderá complementar equipe, processos e preferências
            depois, diretamente no painel.
          </p>
        </header>

        {params.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Não foi possível concluir a configuração: {decodeURIComponent(params.error)}
          </div>
        ) : null}

        {params.success === "email_resent" ? (
          <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            Email de confirmação reenviado! Verifique sua caixa de entrada.
          </div>
        ) : null}

        <OnboardingForm initialData={initialData} />
      </div>
    </main>
  );
}
