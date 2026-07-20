import { Ban } from "lucide-react";
import { signOut } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TenantSuspendedPage() {
  return (
    <Card>
      <CardHeader>
        <Ban className="h-7 w-7 text-destructive" />
        <CardTitle>Acesso temporariamente suspenso</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
        <p>O acesso deste escritório está suspenso no momento. Os dados continuam preservados e o acesso será liberado quando o Super Admin reativar o tenant.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">Sair</Button>
        </form>
      </CardContent>
    </Card>
  );
}
