import { CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "./actions";

function MessageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-primary"><MailCheck className="h-6 w-6" /></div><h1 className="mt-4 font-display text-2xl font-semibold">{title}</h1><div className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">{children}</div></CardContent></Card>;
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-12"><div className="mx-auto w-full max-w-lg"><MessageCard title="Confirme seu e-mail para continuar"><p>Enviamos um link de confirmação para o seu e-mail. Abra a mensagem e clique no link para terminar o cadastro do escritório.</p><p className="mt-3">Depois da confirmação, você voltará para esta etapa automaticamente.</p><Button asChild className="mt-5"><a href="/login">Já confirmei, entrar</a></Button></MessageCard></div></main>;
  }

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.tenant_id) {
    return <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-12"><div className="mx-auto w-full max-w-lg"><MessageCard title="Seu escritório já está pronto"><p>Seu acesso já está vinculado a um escritório. Você pode seguir para o painel.</p><Button asChild className="mt-5"><a href="/monitoramento">Ir para o painel</a></Button></MessageCard></div></main>;
  }

  const metadata = user.user_metadata ?? {};
  return <main className="min-h-screen bg-[var(--tenant-paper)] px-4 py-8 sm:px-6"><div className="mx-auto w-full max-w-3xl space-y-6"><header className="text-center"><p className="text-sm font-medium text-primary">Configuração inicial</p><h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-card-foreground)]">Vamos preparar seu escritório</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--color-muted-foreground)]">Preencha os dados abaixo. Você poderá complementar equipe, processos e preferências depois, diretamente no painel.</p></header>{params.error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Não foi possível concluir a configuração: {decodeURIComponent(params.error)}</div> : null}<Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-6"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]"><CheckCircle2 className="h-5 w-5" /></div><div><h2 className="font-display text-xl font-semibold">Dados do escritório</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Estas informações criam o seu ambiente exclusivo no MeuJudi.</p></div></div><form action={completeOnboarding} className="mt-6 grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="tenant_name">Nome do escritório</Label><Input id="tenant_name" name="tenant_name" required defaultValue={String(metadata.office ?? "")} placeholder="Ex.: Silva Advocacia" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="user_name">Seu nome</Label><Input id="user_name" name="user_name" required defaultValue={String(metadata.name ?? "")} placeholder="Nome completo" /></div><div className="space-y-2"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" placeholder="Ex.: Curitiba" /></div><div className="space-y-2"><Label htmlFor="state">Estado</Label><Input id="state" name="state" maxLength={2} placeholder="PR" /></div><div className="space-y-2"><Label htmlFor="oab_number">OAB principal <span className="text-[var(--color-muted-foreground)]">(opcional)</span></Label><Input id="oab_number" name="oab_number" defaultValue={String(metadata.oab ?? "")} placeholder="Número da OAB" /></div><div className="space-y-2"><Label htmlFor="oab_uf">UF da OAB <span className="text-[var(--color-muted-foreground)]">(opcional)</span></Label><Input id="oab_uf" name="oab_uf" maxLength={2} defaultValue={String(metadata.uf ?? "")} placeholder="PR" /></div><div className="mt-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-sm text-[var(--color-muted-foreground)] sm:col-span-2"><ShieldCheck className="mr-2 inline h-4 w-4 text-[var(--tenant-moss)]" />Seu escritório terá um ambiente separado, com acesso restrito às pessoas da sua equipe.</div><Button className="sm:col-span-2" type="submit">Criar escritório e entrar no painel</Button></form></CardContent></Card></div></main>;
}
