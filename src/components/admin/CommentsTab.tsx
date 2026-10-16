import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Panel, btnGhost } from "./AdminApp";
import { withBase } from "@/lib/utils";

const db = () => supabase!;

export function CommentsTab() {
  const { data = [], refetch } = useQuery({
    queryKey: ["admin-comments"],
    queryFn: async () => (await db().from("comments").select("*,post:posts(title,slug)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Comentários</h1>
      <Panel title={`${data.length} recentes`}>
        <ul className="divide-y">
          {data.map((c) => (
            <li key={c.id} className={`flex gap-4 py-3 ${c.approved ? "" : "opacity-50"}`}>
              <div className="flex-1">
                <p className="text-sm"><b>{c.author_name}</b> em <a className="text-primary" href={withBase(`post/${c.post?.slug}`)} target="_blank" rel="noreferrer">{c.post?.title}</a></p>
                <p className="mt-1 text-sm">{c.body}</p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <button className={btnGhost} onClick={async () => { await db().from("comments").update({ approved: !c.approved }).eq("id", c.id); refetch(); }}>{c.approved ? "Ocultar" : "Mostrar"}</button>
                <button className={btnGhost} onClick={async () => { if (confirm("Excluir?")) { await db().from("comments").delete().eq("id", c.id); refetch(); } }}>Excluir</button>
              </div>
            </li>
          ))}
          {!data.length && <li className="py-3 text-muted-foreground">Nenhum comentário ainda.</li>}
        </ul>
      </Panel>
    </div>
  );
}
