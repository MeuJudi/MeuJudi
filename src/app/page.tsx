import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, FileSearch, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const benefits = [
  {
    icon: FileSearch,
    title: "Processos em um só lugar",
    text: "Acompanhe movimentações, prazos e audiências sem perder tempo procurando informações.",
  },
  {
    icon: CalendarDays,
    title: "Agenda que evita surpresas",
    text: "Organize compromissos e prazos importantes para a sua equipe trabalhar com antecedência.",
  },
  {
    icon: ClipboardCheck,
    title: "Tarefas que saem do papel",
    text: "Distribua o trabalho, acompanhe cada etapa e saiba o que precisa de atenção agora.",
  },
  {
    icon: UsersRound,
    title: "Clientes bem acompanhados",
    text: "Mantenha os contatos e o relacionamento organizados em um funil simples e visual.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#08111f] text-white">
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
        <div className="pointer-events-none absolute -left-48 top-28 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-blue-700/15 blur-3xl" />

        <header className="relative flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="MeuJudi">
            <Image src="/meujudi-icon.png" alt="" width={42} height={42} className="h-10 w-10 object-contain" priority />
            <span className="text-xl font-semibold tracking-tight">MeuJudi</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild className="bg-sky-500 text-white hover:bg-sky-400">
              <Link href="/register">Criar conta <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </header>

        <div className="relative grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-sm font-medium text-sky-200">
              <CheckCircle2 className="h-4 w-4" /> Feito para escritórios de advocacia
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Seu escritório organizado. <span className="text-sky-400">Sua rotina sob controle.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Processos, prazos, agenda, tarefas e clientes em um só lugar para você e sua equipe trabalharem com mais clareza e segurança.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-sky-500 text-white hover:bg-sky-400">
                <Link href="/register">Começar agora <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <Link href="/login">Já tenho uma conta</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-slate-400">Comece pelo cadastro do seu escritório e convide sua equipe quando estiver pronto.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="border-white/10 bg-white/[0.06] text-white shadow-xl shadow-black/10 backdrop-blur-sm">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300">
                    <benefit.icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 text-lg font-semibold">{benefit.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{benefit.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <footer className="relative border-t border-white/10 pt-5 text-sm text-slate-400">
          MeuJudi · Gestão simples para a rotina do seu escritório.
        </footer>
      </section>
    </main>
  );
}
