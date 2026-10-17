import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { commentsQuery, formatDate, sessionId } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Comment } from "@/lib/types";

function Form({ postId, parentId, onDone }: { postId: string; parentId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [trap, setTrap] = useState(""); // isca anti-robô: pessoas não veem nem preenchem este campo
  const openedAt = useRef(Date.now());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || body.trim().length < 2) { toast.error("Preencha nome e comentário."); return; }
    if (!supabase) { toast.info("Comentários funcionam após conectar o banco de dados."); return; }
    if (Date.now() - openedAt.current < 3000) { toast.info("Um instante... revise seu comentário e envie de novo."); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("add_comment", {
      _post_id: postId,
      _author: name.trim().slice(0, 60),
      _body: body.trim().slice(0, 3000),
      _parent_id: parentId ?? null,
      _hp: trap,
      _session: sessionId(),
    });
    setBusy(false);
    const status = String(data ?? "");
    if (error || status === "invalid") { toast.error("Não foi possível publicar o comentário. Confira o nome e o texto."); return; }
    if (status === "limited") { toast.error("Muitos comentários em pouco tempo. Tente de novo mais tarde."); return; }
    localStorage.setItem("comment_name", name.trim());
    setBody("");
    if (status === "pending") toast.success("Comentário enviado! Ele aparece depois de aprovado.");
    qc.invalidateQueries({ queryKey: ["comments", postId] });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        name="website"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
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
