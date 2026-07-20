import Link from "next/link";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--tenant-paper)] px-6 py-12">
      <section className="w-full max-w-xl rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-8 text-center shadow-sm">
        <Wrench className="mx-auto h-10 w-10 text-[var(--tenant-brass)]" />
        <h1 className="mt-5 font-display text-3xl font-semibold text-[var(--tenant-surface-foreground)]">Manutenção programada</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-muted-foreground)]">O MeuJudi está temporariamente indisponível para atualização. Tente novamente quando a manutenção terminar.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline"><Link href="/login">Voltar ao login</Link></Button>
          <form action={signOut}><Button type="submit">Sair</Button></form>
        </div>
      </section>
    </main>
  );
}
