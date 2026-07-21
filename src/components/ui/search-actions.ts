"use server";

import { requireAppUser } from "@/lib/auth/guards";
import type { SearchHit } from "@/components/ui/search-input";

const PROCESS_FIELDS = "id, cnj, titulo, classe_judicial, assunto_principal, status, fase, valor_causa";
const CLIENT_FIELDS = "id, name, email, phone, cpf_cnpj";
const TASK_FIELDS = "id, title, priority, kanban_column_id";
const AGENDA_FIELDS = "id, titulo, tipo, data_inicio, data_fim";

/**
 * Busca unificada no tenant atual.
 * Retorna até N resultados por tipo, com prioridade para match exato.
 */
export async function globalSearch(
  query: string,
  options: { perType?: number; types?: string[] } = {}
): Promise<SearchHit[]> {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return [];
  const { perType = 5, types } = options;
  const q = query.trim();
  if (q.length < 2) return [];

  const wantProcessos = !types || types.includes("processo");
  const wantClientes = !types || types.includes("cliente");
  const wantTarefas = !types || types.includes("tarefa");
  const wantAgenda = !types || types.includes("agenda");

  const term = `%${q}%`;
  const promises: Promise<SearchHit[]>[] = [];

  if (wantProcessos) {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from("processos")
          .select(PROCESS_FIELDS)
          .eq("tenant_id", profile.tenant_id)
          .or(
            `cnj.ilike.${term},titulo.ilike.${term},classe_judicial.ilike.${term},assunto_principal.ilike.${term},tags.cs.{${q}}`
          )
          .limit(perType);
        return (data ?? []).map<SearchHit>((p: any) => ({
          id: p.id,
          type: "processo",
          title: p.titulo || p.cnj || "Sem título",
          subtitle: p.cnj
            ? `CNJ ${p.cnj}${p.classe_judicial ? ` · ${p.classe_judicial}` : ""}`
            : p.classe_judicial || "Processo",
          meta: p.status || p.fase || undefined,
          href: `/monitoramento?processo=${p.id}`,
        }));
      })()
    );
  }

  if (wantClientes) {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from("clientes")
          .select(CLIENT_FIELDS)
          .eq("tenant_id", profile.tenant_id)
          .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},cpf_cnpj.ilike.${term}`)
          .limit(perType);
        return (data ?? []).map<SearchHit>((c: any) => ({
          id: c.id,
          type: "cliente",
          title: c.name,
          subtitle: [c.email, c.phone, c.cpf_cnpj].filter(Boolean).join(" · "),
          meta: undefined,
          href: `/clientes?cliente=${c.id}`,
        }));
      })()
    );
  }

  if (wantTarefas) {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from("tarefas")
          .select(TASK_FIELDS)
          .eq("tenant_id", profile.tenant_id)
          .or(`title.ilike.${term},description.ilike.${term}`)
          .limit(perType);
        return (data ?? []).map<SearchHit>((t: any) => ({
          id: t.id,
          type: "tarefa",
          title: t.title,
          subtitle: t.description ? t.description.slice(0, 80) : "Tarefa",
          meta: t.priority,
          href: `/tarefas?tarefa=${t.id}`,
        }));
      })()
    );
  }

  if (wantAgenda) {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from("agenda_eventos")
          .select(AGENDA_FIELDS)
          .eq("tenant_id", profile.tenant_id)
          .or(`titulo.ilike.${term},descricao.ilike.${term},local.ilike.${term}`)
          .limit(perType);
        return (data ?? []).map<SearchHit>((a: any) => ({
          id: a.id,
          type: "agenda",
          title: a.titulo,
          subtitle: a.tipo || "Evento",
          meta: a.data_inicio ? new Date(a.data_inicio).toLocaleDateString("pt-BR") : undefined,
          href: `/agenda?evento=${a.id}`,
        }));
      })()
    );
  }

  const results = await Promise.all(promises);
  return results.flat();
}
