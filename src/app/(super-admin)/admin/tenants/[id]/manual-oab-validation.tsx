"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { manuallyValidateOab } from "../../actions";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export function ManualOabValidation({ tenantId, users }: { tenantId: string; users: User[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [oabNumber, setOabNumber] = useState("");
  const [oabUf, setOabUf] = useState("");

  const activeUsers = users.filter((u) => u.is_active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set("user_id", selectedUserId);
    formData.set("tenant_id", tenantId);
    formData.set("oab_number", oabNumber);
    formData.set("oab_uf", oabUf);

    startTransition(async () => {
      try {
        const result = await manuallyValidateOab(formData);
        if (result.ok) {
          setSuccess(result.message);
          setSelectedUserId("");
          setOabNumber("");
          setOabUf("");
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Validação Manual de OAB
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member">Membro da equipe</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="member">
                <SelectValue placeholder="Selecione o membro" />
              </SelectTrigger>
              <SelectContent>
                {activeUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="oab_number">Número da OAB</Label>
              <Input
                id="oab_number"
                type="text"
                placeholder="Ex: 123456"
                value={oabNumber}
                onChange={(e) => setOabNumber(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oab_uf">UF</Label>
              <Select value={oabUf} onValueChange={setOabUf}>
                <SelectTrigger id="oab_uf">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}

          <Button type="submit" disabled={isPending || !selectedUserId || !oabNumber || !oabUf}>
            {isPending ? "Validando..." : "Validar OAB"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
