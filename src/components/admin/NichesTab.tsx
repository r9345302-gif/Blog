import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Lightbulb, Plus, Sparkles, Split, PenLine, Pause, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Niche } from "@/lib/types";
import { brainstorm, expandIdea, slugify, writeAndPublish, runNiche, nextRun } from "@/lib/pipeline-core";
import { buildCtx } from "./useGeminiCtx";
import { Field, Panel, areaCls, btnCls, btnGhost, inputCls } from "./AdminApp";

const db = () => supabase!;

export function NichesTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: niches = [], refetch } = useQuery({
    queryKey: ["admin-niches"],
    queryFn: async () => (await db().from("niches").select("*").order("sort_order").order("name")).data as Niche[],
  });
  const { data: counts = {} } = useQuery({
    queryKey: ["admin-niche-counts"],
    queryFn: async () => {
      const { data } = await db().from("posts").select("niche_id,status");
      const c: Record<string, { pub: number; pend: number }> = {};
      for (const p of data ?? []) {
        const k = p.niche_id ?? "";
        c[k] ??= { pub: 0, pend: 0 };
        if (p.status === "published") c[k].pub++;
        if (p.status === "pending") c[k].pend++;
      }
      return c;
    },
  });

  async function create() {
    const name = prompt("Nome do novo nicho:");
    if (!name) return;
    const { data, error } = await db().from("niches").insert({ name, slug: slugify(name) }).select("id").single();
    if (error) return toast.error(error.message);
    await refetch();
    setSelected(data.id);
  }

  const current = niches.find((n) => n.id === selected);
  if (current) return <NicheDetail niche={current} onBack={() => setSelected(null)} onChange={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Nichos</h1>
        <button className={btnCls} onClick={create}><Plus className="h-4 w-4" /> Novo nicho</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {niches.map((n) => (
          <button key={n.id} onClick={() => setSelected(n.id)} className="border bg-card p-5 text-left hover:border-primary">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: n.color }} />
              <h3 className="text-lg font-black">{n.name}</h3>
              {!n.active && <span className="ml-auto text-xs font-bold text-muted-foreground">INATIVO</span>}
              {n.paused_reason && <span className="ml-auto text-xs font-bold text-destructive">PAUSADO</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{n.description || "Sem descrição"}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <Stat label="Publicados" v={counts[n.id]?.pub ?? 0} />
              <Stat label="Revisão" v={counts[n.id]?.pend ?? 0} />
              <Stat label="A cada" v={`${n.interval_days}d`} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Próximo: {new Date(n.next_run_at).toLocaleString("pt-BR")}</p>
          </button>
        ))}
        {!niches.length && <p className="text-muted-foreground">Crie seu primeiro nicho para começar.</p>}
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string | number }) {
  return (
    <div className="bg-secondary p-2">
      <div className="text-lg font-black">{v}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

function NicheDetail({ niche, onBack, onChange }: { niche: Niche; onBack: () => void; onChange: () => void }) {
  const [form, setForm] = useState<Niche>(niche);
  const set = <K extends keyof Niche>(k: K, v: Niche[K]) => setForm({ ...form, [k]: v });

  async function save() {
    const { id, ...rest } = form;
    const { error } = await db().from("niches").update({ ...rest, slug: slugify(rest.slug || rest.name) }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Nicho salvo");
    onChange();
  }
  async function remove() {
    if (!confirm(`Excluir o nicho "${niche.name}"? Ideias e tópicos serão apagados; posts ficam sem nicho.`)) return;
    await db().from("niches").delete().eq("id", niche.id);
    onBack();
    onChange();
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> Nichos</button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black">{niche.name}</h1>
        {niche.paused_reason && (
          <div className="flex items-center gap-2 bg-destructive/10 px-3 py-1 text-sm text-destructive">
            Pausado: {niche.paused_reason.slice(0, 120)}
            <button
              className="font-bold underline"
              onClick={async () => {
                await db().from("niches").update({ paused_reason: null }).eq("id", niche.id);
                onChange();
              }}
            >
              Retomar
            </button>
          </div>
        )}
      </div>

      <Pipeline niche={niche} onChange={onChange} />

      <Panel title="Configurações do projeto" actions={<button className={btnCls} onClick={save}>Salvar</button>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Endereço (slug)" hint={`/nicho/${form.slug}`}><input className={inputCls} value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
          <Field label="Descrição"><textarea className={areaCls} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Público-alvo"><textarea className={areaCls} rows={2} value={form.audience} onChange={(e) => set("audience", e.target.value)} /></Field>
          <Field label="Tom de voz"><input className={inputCls} value={form.tone} onChange={(e) => set("tone", e.target.value)} /></Field>
          <Field label="Nome do autor"><input className={inputCls} value={form.author_name} onChange={(e) => set("author_name", e.target.value)} /></Field>
          <Field label="Mínimo de palavras"><input type="number" className={inputCls} value={form.min_words} onChange={(e) => set("min_words", Number(e.target.value))} /></Field>
          <Field label="Publicar a cada (dias)"><input type="number" min={1} className={inputCls} value={form.interval_days} onChange={(e) => set("interval_days", Number(e.target.value))} /></Field>
          <Field label="Horário de publicação (UTC, 0–23)" hint="Brasília = UTC − 3"><input type="number" min={0} max={23} className={inputCls} value={form.publish_hour} onChange={(e) => set("publish_hour", Number(e.target.value))} /></Field>
          <Field label="Próxima publicação"><input type="datetime-local" className={inputCls} value={toLocal(form.next_run_at)} onChange={(e) => set("next_run_at", new Date(e.target.value).toISOString())} /></Field>
          <Field label="Tags padrão" hint="Separadas por vírgula"><input className={inputCls} value={form.default_tags.join(", ")} onChange={(e) => set("default_tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
          <Field label="Cor"><input type="color" className="h-10 w-20 border border-input" value={form.color} onChange={(e) => set("color", e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="Estrutura do post (opcional)" hint="Se vazio, usa a estrutura geral das Configurações gerais.">
              <textarea className={areaCls} rows={6} value={form.post_structure ?? ""} onChange={(e) => set("post_structure", e.target.value || null)} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Instruções extras para a IA"><textarea className={areaCls} rows={3} value={form.extra_instructions} onChange={(e) => set("extra_instructions", e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.require_review} onChange={(e) => set("require_review", e.target.checked)} /> Revisar antes de publicar</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Nicho ativo (visível e com publicação automática)</label>
        </div>
        <button onClick={remove} className="mt-6 text-sm font-semibold text-destructive hover:underline">Excluir nicho</button>
      </Panel>

      <Runs nicheId={niche.id} />
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Pipeline({ niche, onChange }: { niche: Niche; onChange: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["pipeline", niche.id],
    queryFn: async () => {
      const [ideas, subs] = await Promise.all([
        db().from("ideas").select("*").eq("niche_id", niche.id).order("created_at", { ascending: false }).limit(30),
        db().from("subtopics").select("*").eq("niche_id", niche.id).order("created_at", { ascending: false }).limit(50),
      ]);
      return { ideas: ideas.data ?? [], subs: subs.data ?? [] };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pipeline", niche.id] });
    qc.invalidateQueries({ queryKey: ["runs", niche.id] });
    qc.invalidateQueries({ queryKey: ["admin-niche-counts"] });
  };

  async function run(label: string, fn: (ctx: Awaited<ReturnType<typeof buildCtx>>) => Promise<unknown>) {
    setBusy(label);
    try {
      const ctx = await buildCtx(niche);
      await fn(ctx);
      toast.success(`${label}: concluído`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const newIdeas = data?.ideas.filter((i) => i.status === "new") ?? [];
  const newSubs = data?.subs.filter((s) => s.status === "new") ?? [];

  return (
    <Panel
      title="Criação com IA"
      actions={
        <div className="flex gap-2">
          <button
            className={btnGhost}
            onClick={async () => {
              await db().from("niches").update({ active: !niche.active }).eq("id", niche.id);
              onChange();
            }}
          >
            {niche.active ? <><Pause className="h-4 w-4" /> Pausar automático</> : <><Play className="h-4 w-4" /> Ativar automático</>}
          </button>
          <button
            disabled={!!busy}
            className={btnCls}
            onClick={() =>
              run("Ciclo completo", async (ctx) => {
                await runNiche(ctx);
                await db().from("niches").update({ next_run_at: nextRun(ctx.niche) }).eq("id", niche.id);
                onChange();
              })
            }
          >
            <Sparkles className="h-4 w-4" /> {busy === "Ciclo completo" ? "Gerando..." : "Gerar post agora"}
          </button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-muted-foreground">
        O robô do GitHub roda a cada 15 minutos e executa estas etapas sozinho quando chega a hora da próxima publicação. Use os botões para testar manualmente.
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">1. Ideias <span className="text-muted-foreground">({newIdeas.length} novas)</span></h3>
            <button disabled={!!busy} className={btnGhost} onClick={() => run("Brainstorm", brainstorm)}>
              <Lightbulb className="h-4 w-4" /> {busy === "Brainstorm" ? "..." : "+5"}
            </button>
          </div>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {data?.ideas.map((i) => (
              <li key={i.id} className={`border p-2 text-sm ${i.status !== "new" ? "opacity-50" : ""}`}>
                <p className="font-semibold">{i.title}</p>
                {i.status === "new" && (
                  <button disabled={!!busy} className="mt-1 flex items-center gap-1 text-xs font-bold text-primary" onClick={() => run("Destrinchar", (ctx) => expandIdea(ctx, i))}>
                    <Split className="h-3 w-3" /> Destrinchar em 5 tópicos
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-2">
          <h3 className="mb-3 font-bold">2. Tópicos <span className="text-muted-foreground">({newSubs.length} disponíveis)</span></h3>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {data?.subs.map((s) => (
              <li key={s.id} className={`flex items-start justify-between gap-3 border p-2 text-sm ${s.status !== "new" ? "opacity-50" : ""}`}>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.angle}</p>
                </div>
                {s.status === "new" && (
                  <button disabled={!!busy} className={btnGhost} onClick={() => run("Escrever", (ctx) => writeAndPublish(ctx, s))}>
                    <PenLine className="h-4 w-4" /> {busy === "Escrever" ? "..." : "3–6. Escrever"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Runs({ nicheId }: { nicheId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["runs", nicheId],
    queryFn: async () => (await db().from("pipeline_runs").select("*").eq("niche_id", nicheId).order("created_at", { ascending: false }).limit(30)).data ?? [],
  });
  return (
    <Panel title="Histórico de execuções">
      <ul className="divide-y text-sm">
        {data.map((r) => (
          <li key={r.id} className="flex gap-3 py-2">
            <span className={`w-14 shrink-0 text-xs font-bold uppercase ${r.status === "error" ? "text-destructive" : "text-primary"}`}>{r.status}</span>
            <span className="w-20 shrink-0 text-xs font-semibold">{r.step}</span>
            <span className="flex-1 text-muted-foreground">{r.message}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{r.source} · {new Date(r.created_at).toLocaleString("pt-BR")}</span>
          </li>
        ))}
        {!data.length && <li className="py-2 text-muted-foreground">Nenhuma execução ainda.</li>}
      </ul>
    </Panel>
  );
}
