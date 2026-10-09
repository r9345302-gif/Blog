import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { commentsQuery, formatDate } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Comment } from "@/lib/types";

function Form({ postId, parentId, onDone }: { postId: string; parentId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || body.trim().length < 2) return toast.error("Preencha nome e comentário.");
    if (!supabase) return toast.info("Comentários funcionam após conectar o banco de dados.");
    setBusy(true);
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      parent_id: parentId ?? null,
      author_name: name.trim().slice(0, 60),
      body: body.trim().slice(0, 3000),
    });
    setBusy(false);
    if (error) return toast.error("Não foi possível publicar o comentário.");
    localStorage.setItem("comment_name", name.trim());
    setBody("");
    qc.invalidateQueries({ queryKey: ["comments", postId] });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        value={name}
        onFocus={() => !name && setName(localStorage.getItem("comment_name") ?? "")}
        onChange={(e) => setName(e.target.value)}
        placeholder="Seu nome"
        maxLength={60}
        className="h-10 w-full max-w-xs border border-input bg-card px-3 text-sm outline-none focus:border-primary"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Escreva sua resposta..." : "O que você achou? Participe da conversa..."}
        maxLength={3000}
        rows={parentId ? 3 : 4}
        className="w-full border border-input bg-card p-3 text-sm outline-none focus:border-primary"
      />
      <button disabled={busy} className="bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {parentId ? "Responder" : "Comentar"}
      </button>
    </form>
  );
}

function Item({ c, all, postId }: { c: Comment; all: Comment[]; postId: string }) {
  const [replying, setReplying] = useState(false);
  const replies = all.filter((x) => x.parent_id === c.id);
  return (
    <li className="py-5">
      <div className="flex items-baseline gap-2">
        <span className="font-bold">{c.author_name}</span>
        <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{c.body}</p>
      <button onClick={() => setReplying(!replying)} className="mt-2 text-xs font-bold uppercase text-primary">
        Responder
      </button>
      {replying && (
        <div className="mt-3">
          <Form postId={postId} parentId={c.id} onDone={() => setReplying(false)} />
        </div>
      )}
      {replies.length > 0 && (
        <ul className="ml-5 mt-2 border-l-2 pl-5">
          {replies.map((r) => (
            <Item key={r.id} c={r} all={all} postId={postId} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Comments({ postId }: { postId: string }) {
  const { data = [] } = useQuery({ ...commentsQuery(postId), enabled: !!supabase });
  const roots = data.filter((c) => !c.parent_id);
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-black">Comentários ({data.length})</h2>
      <div className="mt-5">
        <Form postId={postId} />
      </div>
      <ul className="mt-6 divide-y">
        {roots.map((c) => (
          <Item key={c.id} c={c} all={data} postId={postId} />
        ))}
      </ul>
    </section>
  );
}
