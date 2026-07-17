import { requireAppUser } from "@/lib/auth/guards";
import { SegurancaForm } from "./seguranca-form";

export default async function SegurancaPage() {
  await requireAppUser();

  return <SegurancaForm />;
}
