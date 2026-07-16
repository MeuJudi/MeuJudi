import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "../actions";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar no MeuJudi</CardTitle>
        <CardDescription>Acesse o painel do seu escritorio.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="voce@escritorio.com.br" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" />
          </div>
          <Button className="w-full" type="submit">
            <LogIn className="h-4 w-4" />
            Entrar
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda nao tem conta?{" "}
          <Link className="font-medium text-primary" href="/register">
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
