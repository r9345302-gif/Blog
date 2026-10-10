import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { Panel } from "./AdminApp";

const db = () => supabase!;

interface Row {
  post_id: string;
  niche_id: string | null;
  title: string;
  slug: string;
  views: number;
  avg_seconds: number | null;
  comments: number;
  avg_relevance: number | null;
  ratings: number;
}

const fmt = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);

export function StatsTab() {
  const [days, setDays] = useState(30);
  const { data: rows = [] } = useQuery({
    queryKey: ["stats", days],
    queryFn: async () => ((await db().rpc("admin_post_stats", { _days: days })).data ?? []) as Row[],
  });
  const { data: daily = [] } = useQuery({
    queryKey: ["daily", days],
    queryFn: async () => (await db().rpc("admin_daily_views", { _days: days })).data ?? [],
  });
  const { data: niches = [] } = useQuery({
    queryKey: ["admin-niches"],
    queryFn: async () => (await db().from("niches").select("*").order("sort_order").order("name")).data ?? [],
  });

  const total = rows.reduce((a, r) => a + Number(r.views), 0);
  const withTime = rows.filter((r) => r.avg_seconds);
  const avgTime = withTime.length ? withTime.reduce((a, r) => a + Number(r.avg_seconds), 0) / withTime.length : null;
  const byNiche = niches.map((n: { id: string; name: string }) => {
    const list = rows.filter((r) => r.niche_id === n.id);
    const t = list.filter((r) => r.avg_seconds);
    return {
      name: n.name,
      posts: list.length,
      views: list.reduce((a, r) => a + Number(r.views), 0),
      avg: t.length ? t.reduce((a, r) => a + Number(r.avg_seconds), 0) / t.length : null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Estatísticas</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 border bg-card px-2 text-sm">
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
          <option value={365}>1 ano</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Big label="Visitas" v={total.toLocaleString("pt-BR")} />
        <Big label="Tempo médio de leitura" v={fmt(avgTime)} />
        <Big label="Posts publicados" v={rows.length} />
      </div>
      <Panel title="Visitas por dia">
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="views" fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Por nicho">
        <Table head={["Nicho", "Posts", "Visitas", "Tempo médio"]} rows={byNiche.map((n) => [n.name, n.posts, n.views, fmt(n.avg)])} />
      </Panel>
      <Panel title="Por post">
        <Table
          head={["Post", "Visitas", "Tempo médio", "Nota", "Avaliações", "Comentários"]}
          rows={[...rows].sort((a, b) => b.views - a.views).map((r) => [r.title, r.views, fmt(r.avg_seconds), r.avg_relevance ?? "—", r.ratings, r.comments])}
        />
      </Panel>
    </div>
  );
}

function Big({ label, v }: { label: string; v: string | number }) {
  return (
    <div className="border bg-card p-5">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black">{v}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground">
        <tr>{head.map((h) => <th key={h} className="py-2">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={`py-2 ${j === 0 ? "font-semibold" : ""}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
