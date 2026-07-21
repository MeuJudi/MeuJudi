import { Activity, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { calcularPercentualRevisaoHumana } from "@/lib/extracao/metrica-saude";
import { AcoesManuais } from "./acoes-manuais";

const LABELS_TIPO: Record<string, string> = {
  regex_criada: "Regex nova criada",
  mudanca_estado: "Mudança de estado",
  promocao_global: "Promovida para global",
  reversao_promocao_global: "Promoção global revertida",
  teto_atingido: "Teto de custo atingido",
  correcao_humana: "Correção humana registrada",
  ia_generalista_sem_regex: "Resolvido por IA sem regex",
  erro: "Erro do motor",
  acao_manual_admin: "Ação manual (Super Admin)",
};

interface MotorExtracaoPageProps {
  searchParams: Promise<{ tenant?: string; tribunal?: string; tipo?: string }>;
}

export default async function MotorExtracaoPage({ searchParams }: MotorExtracaoPageProps) {
  const { supabase } = await requireSuperAdmin();
  const params = await searchParams;

  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = new Date().toISOString().slice(0, 7);

  let query = supabase
    .from("motor_extracao_log")
    .select("*, tenant:tenants(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (params.tenant) query = query.eq("tenant_id", params.tenant);
  if (params.tribunal) query = query.eq("tribunal_origem", params.tribunal);
  if (params.tipo) query = query.eq("tipo", params.tipo);

  const [{ data: eventos }, { data: distribuicaoEstados }, { data: consumoHoje }, { count: totalCacheHits }, percentualRevisao] =
    await Promise.all([
      query,
      supabase.rpc("contar_regex_por_estado"),
      supabase.from("consumo_ia_diario").select("custo_usd_acumulado").eq("data", hoje),
      supabase.from("extracoes_cache").select("*", { count: "exact", head: true }).gt("total_hits", 0),
      calcularPercentualRevisaoHumana(supabase, mesAtual),
    ]);

  const custoTotalHoje = (consumoHoje ?? []).reduce((s, r) => s + Number(r.custo_usd_acumulado), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Motor de Extração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tudo que o sistema Regex + IA faz sozinho, com opção de intervir manualmente quando necessário.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          titulo="% revisão humana (mês)"
          valor={`${(percentualRevisao * 100).toFixed(1)}%`}
          legenda="Deve cair mês a mês se o sistema está aprendendo"
        />
        <StatCard
          titulo="Custo IA hoje (todos os tenants)"
          valor={`US$ ${custoTotalHoje.toFixed(2)}`}
          legenda={`Teto do sistema: US$ ${process.env.TETO_CUSTO_IA_SISTEMA_USD ?? "10.00"}`}
        />
        <StatCard
          titulo="Cache hits acumulados"
          valor={String(totalCacheHits ?? 0)}
          legenda="Extrações economizadas por reaproveitamento"
        />
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Regex por estado</div>
            <div className="mt-2 space-y-1 text-sm">
              {distribuicaoEstados?.map((linha: { state: string; total: number }) => (
                <div key={linha.state} className="flex justify-between">
                  <span>{linha.state}</span>
                  <span className="font-medium">{linha.total}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle>Feed de atividade</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-3 pr-4 font-medium">Quando</th>
                <th className="py-3 pr-4 font-medium">Evento</th>
                <th className="py-3 pr-4 font-medium">Tenant</th>
                <th className="py-3 pr-4 font-medium">Tribunal</th>
                <th className="py-3 pr-4 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {eventos?.map((evento) => (
                <tr key={evento.id} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                    {new Date(evento.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{LABELS_TIPO[evento.tipo] ?? evento.tipo}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {(evento.tenant as { name?: string } | null)?.name ?? "-"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{evento.tribunal_origem ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <pre className="max-w-md whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(evento.detalhes, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {(!eventos || eventos.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhum evento ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AcoesManuais />
    </div>
  );
}

function StatCard({ titulo, valor, legenda }: { titulo: string; valor: string; legenda: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3 w-3" />
          {titulo}
        </div>
        <div className="mt-1 text-2xl font-semibold">{valor}</div>
        <div className="mt-1 text-xs text-muted-foreground">{legenda}</div>
      </CardContent>
    </Card>
  );
}
