import { Activity, AlertTriangle, CheckCircle2, Clock3, Filter, Map as MapIcon, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";

type CoverageRow = {
  id: string;
  status: "nao_testado" | "em_validacao" | "parcial" | "validado" | "bloqueado";
  meujudi_validado: boolean;
  processo_encontrado_no_teste: boolean;
  updated_at: string;
  evidencia: Record<string, unknown> | null;
  tribunal: { codigo: string; sigla: string; nome: string; segmento: string } | null;
  crawler: { codigo: string; nome: string; tipo_fonte: string; status: string } | null;
  sistema: { codigo: string; nome: string } | null;
};

type SyncRun = {
  id: string;
  status: string;
  started_at: string;
  duration_ms: number | null;
  items_read: number;
  items_created: number;
  items_updated: number;
  last_error: string | null;
  crawler: { codigo: string; nome: string } | null;
  tribunal: { sigla: string } | null;
};

const statusLabels: Record<CoverageRow["status"], string> = {
  nao_testado: "Nao testado",
  em_validacao: "Em validacao",
  parcial: "Parcial",
  validado: "Validado",
  bloqueado: "Bloqueado",
};

const statusVariants: Record<CoverageRow["status"], "outline" | "secondary" | "default" | "destructive"> = {
  nao_testado: "outline",
  em_validacao: "secondary",
  parcial: "secondary",
  validado: "default",
  bloqueado: "destructive",
};

type SearchParams = {
  tribunal?: string;
  sistema?: string;
  crawler?: string;
  status?: CoverageRow["status"];
};

type CatalogOption = { id: string; codigo: string; nome: string };

export default async function AdminCoberturaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireSuperAdmin();
  const params = await searchParams;
  const [{ data: tribunals, error: tribunalsError }, { data: systems, error: systemsError }, { data: crawlers, error: crawlersError }] = await Promise.all([
    supabase.from("tribunais").select("id,codigo,nome").order("codigo"),
    supabase.from("sistemas").select("id,codigo,nome").order("codigo"),
    supabase.from("crawlers").select("id,codigo,nome").order("codigo"),
  ]);

  if (tribunalsError) throw new Error(tribunalsError.message);
  if (systemsError) throw new Error(systemsError.message);
  if (crawlersError) throw new Error(crawlersError.message);

  const tribunalOptions = (tribunals ?? []) as CatalogOption[];
  const systemOptions = (systems ?? []) as CatalogOption[];
  const crawlerOptions = (crawlers ?? []) as CatalogOption[];
  const selectedTribunal = tribunalOptions.find((item) => item.codigo === params.tribunal);
  const selectedSystem = systemOptions.find((item) => item.codigo === params.sistema);
  const selectedCrawler = crawlerOptions.find((item) => item.codigo === params.crawler);
  const selectedStatus = params.status && statusLabels[params.status] ? params.status : undefined;

  let coverageQuery = supabase
      .from("tribunal_coverage")
      .select(
        "id,status,meujudi_validado,processo_encontrado_no_teste,updated_at,evidencia,tribunal:tribunais(codigo,sigla,nome,segmento),crawler:crawlers(codigo,nome,tipo_fonte,status),sistema:sistemas(codigo,nome)",
      )
      .order("updated_at", { ascending: false })
      .limit(500);
  if (selectedTribunal) coverageQuery = coverageQuery.eq("tribunal_id", selectedTribunal.id);
  if (selectedSystem) coverageQuery = coverageQuery.eq("sistema_id", selectedSystem.id);
  if (selectedCrawler) coverageQuery = coverageQuery.eq("crawler_id", selectedCrawler.id);
  if (selectedStatus) coverageQuery = coverageQuery.eq("status", selectedStatus);

  const [{ data: coverage, error: coverageError }, { data: runs, error: runsError }] = await Promise.all([
    coverageQuery,
    supabase
      .from("source_sync_runs")
      .select(
        "id,status,started_at,duration_ms,items_read,items_created,items_updated,last_error,crawler:crawlers(codigo,nome),tribunal:tribunais(sigla)",
      )
      .order("started_at", { ascending: false })
      .limit(80),
  ]);

  if (coverageError) throw new Error(coverageError.message);
  if (runsError) throw new Error(runsError.message);

  const rows = (coverage ?? []) as unknown as CoverageRow[];
  const syncRuns = (runs ?? []) as unknown as SyncRun[];
  const totals = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      if (row.processo_encontrado_no_teste) acc.withEvidence += 1;
      if (row.meujudi_validado) acc.validated += 1;
      return acc;
    },
    { nao_testado: 0, em_validacao: 0, parcial: 0, validado: 0, bloqueado: 0, withEvidence: 0, validated: 0 },
  );

  const connectorHealth = new Map<string, SyncRun>();
  for (const run of syncRuns) {
    const key = run.crawler?.codigo ?? "desconhecido";
    if (!connectorHealth.has(key)) connectorHealth.set(key, run);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Cobertura nacional</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Acompanhe evidencias por tribunal e fonte sem confundir processo encontrado com PJe validado.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Fontes na matriz" value={rows.length} icon={MapIcon} />
        <MetricCard label="Com evidencia" value={totals.withEvidence} icon={Activity} />
        <MetricCard label="Parciais" value={totals.parcial} icon={AlertTriangle} />
        <MetricCard label="Validados" value={totals.validated} icon={CheckCircle2} />
        <MetricCard label="Bloqueados" value={totals.bloqueado} icon={ShieldAlert} />
      </section>

      <Card>
        <CardHeader><CardTitle><Filter className="mr-2 inline h-4 w-4 text-primary" />Filtrar cobertura</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 md:grid-cols-5">
            <label className="text-xs font-medium text-muted-foreground">Tribunal
              <select name="tribunal" defaultValue={params.tribunal ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
                <option value="">Todos os tribunais</option>
                {tribunalOptions.map((item) => <option key={item.id} value={item.codigo}>{item.codigo.toUpperCase()} - {item.nome}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">Sistema
              <select name="sistema" defaultValue={params.sistema ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
                <option value="">Todos os sistemas</option>
                {systemOptions.map((item) => <option key={item.id} value={item.codigo}>{item.nome}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">Fonte
              <select name="crawler" defaultValue={params.crawler ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
                <option value="">Todas as fontes</option>
                {crawlerOptions.map((item) => <option key={item.id} value={item.codigo}>{item.nome}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">Status
              <select name="status" defaultValue={selectedStatus ?? ""} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">
                <option value="">Todos os status</option>
                {(Object.keys(statusLabels) as CoverageRow["status"][]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Aplicar</button>
              <a href="/admin/cobertura" className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium text-muted-foreground hover:bg-muted">Limpar</a>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saude dos conectores</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {["datajud_publico", "mural_cs", "pje_trt9_cs"].map((code) => {
            const run = connectorHealth.get(code);
            return (
              <div key={code} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{run?.crawler?.nome ?? code}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{code}</p>
                  </div>
                  <Badge variant={run?.status === "completed" ? "default" : run ? "destructive" : "outline"}>
                    {run?.status === "completed" ? "Saudavel" : run ? run.status : "Sem execucao"}
                  </Badge>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {run ? `Ultima execucao: ${formatDate(run.started_at)}` : "Nenhuma execucao auditada ainda."}
                </p>
                {run?.last_error && <p className="mt-2 line-clamp-2 text-xs text-destructive">{run.last_error}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3"><CardTitle>Matriz por tribunal e fonte</CardTitle><span className="text-xs text-muted-foreground">{rows.length} registros</span></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b text-left text-muted-foreground"><tr>
              <th className="py-3 pr-4 font-medium">Tribunal</th><th className="py-3 pr-4 font-medium">Segmento</th><th className="py-3 pr-4 font-medium">Sistema</th><th className="py-3 pr-4 font-medium">Fonte</th><th className="py-3 pr-4 font-medium">Status</th><th className="py-3 pr-4 font-medium">Evidencias</th><th className="py-3 font-medium">Atualizado</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 100).map((row) => {
                const evidence = row.evidencia ?? {};
                return <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-4"><div className="font-medium">{row.tribunal?.sigla ?? "-"}</div><div className="text-xs text-muted-foreground">{row.tribunal?.nome ?? "Tribunal"}</div></td>
                  <td className="py-3 pr-4 text-muted-foreground">{row.tribunal?.segmento ?? "-"}</td>
                  <td className="py-3 pr-4">{row.sistema?.nome ?? "Nao identificado"}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{row.crawler?.codigo ?? "manual"}</td>
                  <td className="py-3 pr-4"><Badge variant={statusVariants[row.status]}>{statusLabels[row.status]}</Badge></td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{Number(evidence.processos ?? 0)} processos · {Number(evidence.comunicacoes_mural ?? 0)} comunicacoes</td>
                  <td className="py-3 text-xs text-muted-foreground">{formatDate(row.updated_at)}</td>
                </tr>;
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum registro de cobertura encontrado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ultimas execucoes auditadas</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b text-left text-muted-foreground"><tr>
              <th className="py-3 pr-4 font-medium">Quando</th><th className="py-3 pr-4 font-medium">Conector</th><th className="py-3 pr-4 font-medium">Tribunal</th><th className="py-3 pr-4 font-medium">Status</th><th className="py-3 pr-4 font-medium">Itens</th><th className="py-3 font-medium">Duracao</th>
            </tr></thead>
            <tbody>
              {syncRuns.slice(0, 30).map((run) => <tr key={run.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(run.started_at)}</td><td className="py-3 pr-4">{run.crawler?.nome ?? "-"}</td><td className="py-3 pr-4">{run.tribunal?.sigla ?? "Global"}</td><td className="py-3 pr-4"><Badge variant={run.status === "completed" ? "default" : "destructive"}>{run.status}</Badge></td><td className="py-3 pr-4 text-xs text-muted-foreground">{run.items_read} lidos · {run.items_created} novos · {run.items_updated} atualizados</td><td className="py-3 text-xs text-muted-foreground"><Clock3 className="mr-1 inline h-3 w-3" />{run.duration_ms != null ? `${run.duration_ms} ms` : "-"}</td>
              </tr>)}
              {syncRuns.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma execucao centralizada registrada ainda.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof MapIcon }) {
  return <Card><CardContent className="pt-5"><Icon className="h-4 w-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}
