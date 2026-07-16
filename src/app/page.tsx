import Link from "next/link";
import { ArrowRight, Database, Download, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: ShieldCheck,
    title: "Isolamento por escritorio",
    text: "Cada equipe acessa apenas seus processos, OABs e eventos.",
  },
  {
    icon: Database,
    title: "Fontes publicas com roteamento",
    text: "Buscas globais sao cruzadas com CNJs e OABs antes de entrar no escritorio.",
  },
  {
    icon: Sparkles,
    title: "Regex + IA",
    text: "Deteccao de prazos, audiencias e informacoes relevantes desde o MVP.",
  },
  {
    icon: Download,
    title: "MeuJudi CS",
    text: "Area reservada para baixar o instalador e conectar o PJe quando habilitado.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-primary">MeuJudi</p>
            <h1 className="text-xl font-semibold tracking-tight">Fundacao Web</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Criar conta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Badge>meujudi-prod pronto para Supabase limpo</Badge>
            <div className="space-y-4">
              <h2 className="max-w-3xl text-5xl font-semibold tracking-tight">
                Controle do escritorio antes de automacao pesada.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Cadastro simples, onboarding guiado, RLS forte e dados preparados para DataJud,
                Mural, IA e MeuJudi CS sem misturar informacoes entre escritorios.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register">Comecar configuracao</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/monitoramento">Ver painel</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="h-5 w-5 text-primary" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {feature.text}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
