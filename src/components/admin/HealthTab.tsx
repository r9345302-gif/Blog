import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Panel } from "./AdminApp";

const db = () => supabase!;
const STALE_MIN = 60; // o robô roda a cada ~15 min; o GitHub às vezes atrasa
const REFRESH = 60_000;

interface RobotStatus {
  last_run_at: string | null;
  last_result: string;
  last_publish_at: string | null;
  last_error: string;
  last_error_at: string | null;
}
interface SiteState {
  content_changed_at: string;
  deploy_requested_at: string;
}
interface NicheRow {
  id: string;
  name: string;
  active: boolean;
  paused_reason: string | null;
  next_run_at: string;
}
interface ErrorRow {
  id: string;
  step: string;
  message: string | null;
  created_at: string;
  niche: { name: string } | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

function ago(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 48) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
}

const tones = {
  green: "border-green-600 bg-green-50 text-green-900",
  amber: "border-amber-500 bg-amber-50 text-amber-900",
  red: "border-red-600 bg-red-50 text-red-900",
} as const;

function nicheState(n: NicheRow) {
  if (!n.active) return { label: "Desativado", cls: "bg-secondary text-muted-foreground" };
  if (n.paused_reason) return { label: "Pausado", cls: "bg-red-100 text-red-800" };
  if (new Date(n.next_run_at).getTime() <= Date.now()) return { label: "Vencido — entra na fila", cls: "bg-amber-100 text-amber-900" };
  return { label: "Aguardando a hora", cls: "bg-green-100 text-green-900" };
}

export function HealthTab() {
  const status = useQuery({
    queryKey: ["health-status"],
    refetchInterval: REFRESH,
    queryFn: async () => {
      const r = await db().from("robot_status").select("*").eq("id", 1).maybeSingle();
      return { row: (r.data as RobotStatus | null) ?? null, missing: !!r.error };
    },
  });
  const site = useQuery({
    queryKey: ["health-site"],
    refetchInterval: REFRESH,
    queryFn: async () => ((await db().from("site_state").select("*").eq("id", 1).maybeSingle()).data as SiteState | null) ?? null,
  });
  const niches = useQuery({
    queryKey: ["health-niches"],
    refetchInterval: REFRESH,
    queryFn: async () =>
      ((await db().from("niches").select("id,name,active,paused_reason,next_run_at").order("sort_order").order("name")).data ?? []) as NicheRow[],
  });
  const lastPosts = useQuery({
    queryKey: ["health-last-posts"],
    refetchInterval: REFRESH,
    queryFn: async () => {
      const { data } = await db()
        .from("posts")
        .select("niche_id,published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(300);
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as { niche_id: string | null; published_at: string | null }[]) {
        if (p.niche_id && p.published_at && !(p.niche_id in map)) map[p.niche_id] = p.published_at;
      }
      return map;
    },
  });
  const pending = useQuery({
    queryKey: ["health-pending"],
    refetchInterval: REFRESH,
    queryFn: async () => (await db().from("posts").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0,
  });
  const errors = useQuery({
    queryKey: ["health-errors"],
    refetchInterval: REFRESH,
    queryFn: async () =>
      ((
        await db()
          .from("pipeline_runs")
          .select("id,step,message,created_at,niche:niches(name)")
          .eq("status", "error")
          .order("created_at", { ascending: false })
          .limit(8)
      ).data ?? []) as unknown as ErrorRow[],
  });

  const row = status.data?.row ?? null;
  const missing = status.data?.missing ?? false;
  const ageMin = row?.last_run_at ? (Date.now() - new Date(row.last_run_at).getTime()) / 60000 : null;
  const stale = ageMin != null && ageMin > STALE_MIN;
  const tone: keyof typeof tones = missing || ageMin == null ? "amber" : stale ? "red" : "green";
  const headline = status.isLoading
    ? "Carregando…"
    : missing
      ? "O painel de saúde ainda não foi ativado: rode o patch SQL 002 no Supabase."
      : ageMin == null
        ? "O robô ainda não registrou nenhuma execução."
        : stale
          ? `O robô parece parado: última execução ${ago(row?.last_run_at)} (o esperado é a cada ~15 min).`
          : `Robô ativo — última execução ${ago(row?.last_run_at)}.`;

  const changedAt = site.data ? new Date(site.data.content_changed_at).getTime() : 0;
  const requestedAt = site.data ? new Date(site.data.deploy_requested_at).getTime() : 0;
  const waitingDeploy = !!site.data && changedAt > requestedAt;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Saúde do robô</h1>

      <div className={`border-l-4 p-4 text-sm font-semibold ${tones[tone]}`}>
        {headline}
        {stale && (
          <p className="mt-2 font-normal">
            Abra o GitHub → Actions → "Robô de posts" e veja o último resultado. O GitHub desliga agendamentos de repositório público depois de 60 dias
            sem atividade; o workflow "Manter agendamentos ativos" existe para evitar isso (se estiver desligado, ative-o em Actions).
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Robô">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última execução</dt>
              <dd>
                {when(row?.last_run_at ?? null)}
                {row?.last_result ? <span className="block text-muted-foreground">{row.last_result}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Último post publicado pelo robô</dt>
              <dd>{when(row?.last_publish_at ?? null)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Último erro</dt>
              <dd>
                {row?.last_error ? (
                  <>
                    {when(row.last_error_at)}
                    <span className="block break-words text-red-700">{row.last_error}</span>
                  </>
                ) : (
                  "Nenhum registrado"
                )}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Site">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Atualização do site</dt>
              <dd>
                {!site.data
                  ? "Indisponível (rode o patch SQL 002)."
                  : waitingDeploy
                    ? "Há mudanças aguardando publicação — entram no ar na próxima rodada do robô (até ~20 min)."
                    : "Site em dia com o conteúdo."}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Posts aguardando revisão</dt>
              <dd>{pending.data ?? 0}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel title="Nichos">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Nicho</th>
                <th className="py-2 pr-4">Situação</th>
                <th className="py-2 pr-4">Próxima publicação</th>
                <th className="py-2">Último post</th>
              </tr>
            </thead>
            <tbody>
              {(niches.data ?? []).map((n) => {
                const st = nicheState(n);
                return (
                  <tr key={n.id} className="border-t align-top">
                    <td className="py-2 pr-4 font-semibold">{n.name}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                      {n.paused_reason ? <span className="mt-1 block max-w-md break-words text-xs text-red-700">{n.paused_reason}</span> : null}
                    </td>
                    <td className="py-2 pr-4">{when(n.next_run_at)}</td>
                    <td className="py-2">{ago(lastPosts.data?.[n.id])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Erros recentes do pipeline">
        {(errors.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum erro registrado.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(errors.data ?? []).map((e) => (
              <li key={e.id} className="py-2">
                <span className="font-semibold">{e.niche?.name ?? "—"}</span> · {e.step} · <span className="text-muted-foreground">{when(e.created_at)}</span>
                <span className="block break-words text-red-700">{(e.message ?? "").slice(0, 300)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
