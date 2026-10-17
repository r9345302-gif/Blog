import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Post } from "@/lib/types";
import { Field, Panel, areaCls, btnCls, btnGhost, inputCls } from "./AdminApp";

const db = () => supabase!;

export function PostsTab() {
  const [filter, setFilter] = useState<"all" | "published" | "pending" | "draft">("all");
  const [editing, setEditing] = useState<Post | null>(null);
  const { data = [], refetch } = useQuery({
    queryKey: ["admin-posts", filter],
    queryFn: async () => {
      let q = db().from("posts").select("*,niche:niches(id,name,slug,color)").order("created_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      return (await q).data as Post[];
    },
  });

  async function setStatus(p: Post, status: Post["status"]) {
    await db().from("posts").update({ status, published_at: status === "published" ? p.published_at ?? new Date().toISOString() : p.published_at }).eq("id", p.id);
    toast.success(status === "published" ? "Publicado — o site é atualizado automaticamente em até ~20 minutos." : "Atualizado");
    refetch();
  }

  if (editing) return <Editor post={editing} onClose={() => { setEditing(null); refetch(); }} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Posts</h1>
        <div className="flex gap-1">
          {(["all", "published", "pending", "draft"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-sm font-semibold ${filter === f ? "bg-ink text-ink-foreground" : "bg-card"}`}>
              {{ all: "Todos", published: "Publicados", pending: "Revisão", draft: "Rascunhos" }[f]}
            </button>
          ))}
        </div>
      </div>
      <Panel title={`${data.length} posts`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Título</th><th>Nicho</th><th>Status</th><th>Palavras</th><th /></tr>
          </thead>
          <tbody className="divide-y">
            {data.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4 font-semibold">{p.title}</td>
                <td>{p.niche?.name ?? "—"}</td>
                <td>{{ published: "Publicado", pending: "Revisão", draft: "Rascunho" }[p.status]}</td>
                <td>{p.word_count}</td>
                <td className="space-x-2 whitespace-nowrap py-2 text-right">
                  {p.status !== "published" && <button className={btnGhost} onClick={() => setStatus(p, "published")}>Publicar</button>}
                  {p.status === "published" && <button className={btnGhost} onClick={() => setStatus(p, "draft")}>Despublicar</button>}
                  <button className={btnGhost} onClick={() => setEditing(p)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Editor({ post, onClose }: { post: Post; onClose: () => void }) {
  const [p, setP] = useState(post);
  async function save() {
    const { error } = await db()
      .from("posts")
      .update({ title: p.title, slug: p.slug, excerpt: p.excerpt, meta_description: p.meta_description, content: p.content, author_name: p.author_name, featured: p.featured, word_count: p.content.split(/\s+/).filter(Boolean).length, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo");
    onClose();
  }
  async function remove() {
    if (!confirm("Excluir este post definitivamente?")) return;
    await db().from("posts").delete().eq("id", p.id);
    onClose();
  }
  return (
    <Panel title="Editar post" actions={<div className="flex gap-2"><button className={btnGhost} onClick={onClose}>Cancelar</button><button className={btnCls} onClick={save}>Salvar</button></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Título"><input className={inputCls} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></Field>
        <Field label="Slug"><input className={inputCls} value={p.slug} onChange={(e) => setP({ ...p, slug: e.target.value })} /></Field>
        <Field label="Resumo"><textarea className={areaCls} rows={2} value={p.excerpt} onChange={(e) => setP({ ...p, excerpt: e.target.value })} /></Field>
        <Field label="Meta descrição (Google)" hint={`${p.meta_description.length}/160`}><textarea className={areaCls} rows={2} value={p.meta_description} onChange={(e) => setP({ ...p, meta_description: e.target.value })} /></Field>
        <Field label="Autor"><input className={inputCls} value={p.author_name} onChange={(e) => setP({ ...p, author_name: e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold"><input type="checkbox" checked={p.featured} onChange={(e) => setP({ ...p, featured: e.target.checked })} /> Destaque na home</label>
        <div className="md:col-span-2"><Field label="Conteúdo (Markdown)"><textarea className={`${areaCls} font-mono`} rows={24} value={p.content} onChange={(e) => setP({ ...p, content: e.target.value })} /></Field></div>
      </div>
      <button onClick={remove} className="mt-4 text-sm font-semibold text-destructive hover:underline">Excluir post</button>
    </Panel>
  );
}
