import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default async function NotificacoesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Notificações</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Configure suas preferências de notificação.
        </p>
      </div>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--tenant-surface-muted)]">
            <Bell className="h-7 w-7 text-[var(--tenant-brass)]" />
          </div>
          <h3 className="mt-4 font-medium text-[var(--color-card-foreground)]">Em breve</h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--color-muted-foreground)]">
            Em breve você poderá configurar suas preferências de notificação por email e push.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
