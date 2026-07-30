// Cron: apaga pedidos de documento sob demanda (document_fetch_requests)
// vencidos e os objetos correspondentes no bucket privado documentos-temp.
// Roda a cada ~10-15min (cron-job.org ou Vercel cron) — expires_at é
// setado na criação da linha (~15min), completo ou não. Mantém o bucket
// como cópia efêmera de sessão de visualização, nunca armazenamento
// permanente do PDF.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: vencidos, error } = await supabase
    .from("document_fetch_requests")
    .select("id, storage_path")
    .lt("expires_at", now);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vencidos || vencidos.length === 0) return NextResponse.json({ apagados: 0 });

  const paths = vencidos.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from("documentos-temp").remove(paths);
    if (removeError) console.error("[limpar-documentos-temp] falha ao apagar objetos do Storage:", removeError.message);
  }

  const ids = vencidos.map((row) => row.id);
  const { error: deleteError } = await supabase.from("document_fetch_requests").delete().in("id", ids);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ apagados: ids.length });
}
