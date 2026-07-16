import { Download, KeyRound, Mail, MonitorCheck, Palette, ShieldCheck, Users } from "lucide-react";
import { AppearanceSettings } from "@/components/tenant/appearance-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/guards";

export default async function ConfiguracoesPage() {
  const { profile } = await requireAppUser();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Configuracoes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preferencias do perfil, escritorio, equipe, aparencia e integracoes do MeuJudi.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Meu perfil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Nome:</strong> {profile.name}</p>
            <p><strong>Email:</strong> {profile.email}</p>
            <p><strong>Papel:</strong> <Badge variant="outline">{profile.role}</Badge></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Notificacoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between border-b pb-3">
              <span>Resumo diario por email</span>
              <Badge className="bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">Ativo</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Alertas de prazo</span>
              <Badge variant="outline">5 dias antes</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <Palette className="h-5 w-5 text-primary" />
          <CardTitle>Aparencia</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceSettings />
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Equipe e permissoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Owners gerenciam convites, papeis e acesso ao escritorio.</p>
            <Button variant="outline" disabled>Gerenciar equipe em breve</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>OABs monitoradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>As OABs do escritorio serao usadas para cruzar DataJud/Mural e distribuir comunicacoes ao tenant correto.</p>
            <Button variant="outline" disabled>Editar OABs em breve</Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <MonitorCheck className="h-5 w-5 text-primary" />
          <CardTitle>CS/PJe</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground lg:grid-cols-[1fr_0.8fr]">
          <div className="space-y-3">
            <p>Instale o MeuJudi CS no Windows para conectar o PJe e enviar dados autorizados para o escritorio.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Versao recomendada: 0.1.5</li>
              <li>Status informativo: desconectado</li>
              <li>Ultima tentativa: aguardando primeira conexao</li>
              <li>Diagnostico do escritorio aparecera quando o CS estiver vinculado ao tenant.</li>
            </ul>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="font-medium text-[var(--color-card-foreground)]">Como conectar</p>
            <p className="mt-2 text-sm">Abra o CS, conecte pelo PJe/GOV ou certificado A1 e acompanhe os diagnosticos enviados.</p>
            <Button className="mt-4" disabled>
              <Download className="h-4 w-4" />
              Download em breve
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <MonitorCheck className="h-5 w-5 text-primary" />
            <CardTitle>Integracoes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            DataJud, Mural, PJe e IA serao ligados conforme as etapas do MVP avancarem.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Seguranca e LGPD</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Aceite de termos, politica de retencao, auditoria e controles de dados sensiveis ficam centralizados aqui.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
