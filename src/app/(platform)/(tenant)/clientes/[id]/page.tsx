import { ClienteDetail } from "./cliente-detail";
import { requireAppUser } from "@/lib/auth/guards";
import { getClientById } from "../actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClienteDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireAppUser();

  const cliente = await getClientById(id);

  return <ClienteDetail cliente={cliente} />;
}
