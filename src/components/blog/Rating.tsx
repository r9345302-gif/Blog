import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ratingQuery, sessionId } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const reactions = [
  { id: "adorei", label: "Adorei" },
  { id: "util", label: "Útil" },
  { id: "neutro", label: "Ok" },
  { id: "fraco", label: "Fraco" },
] as const;

export function Rating({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ ...ratingQuery(postId), enabled: !!supabase });
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(localStorage.getItem(`rated_${postId}`) === "1");
  }, [postId]);

  async function submit() {
    if (!stars) return toast.error("Escolha de 1 a 5 estrelas");
    if (!supabase) return toast.info("Avaliações funcionam após conectar o banco de dados.");
    const { error } = await supabase.from("ratings").insert({ post_id: postId, session_id: sessionId(), relevance: stars, reaction });
    if (error && !error.message.includes("duplicate")) return toast.error("Não foi possível enviar.");
    localStorage.setItem(`rated_${postId}`, "1");
    setDone(true);
    qc.invalidateQueries({ queryKey: ["rating", postId] });
    toast.success("Obrigado pela avaliação!");
  }

  return (
    <section className="mt-14 border-y py-8">
      <h2 className="text-lg font-bold">Este assunto foi relevante para você?</h2>
      {data && data.total > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Nota média {data.avg_relevance} de 5 · {data.total} avaliações
        </p>
      )}
      {done ? (
        <p className="mt-4 text-sm font-semibold text-primary">Você já avaliou este artigo. Obrigado!</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} onMouseEnter={() => setHover(i)} onClick={() => setStars(i)} aria-label={`${i} estrelas`}>
                <Star className={`h-8 w-8 ${(hover || stars) >= i ? "fill-primary text-primary" : "text-border"}`} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {reactions.map((r) => (
              <button
                key={r.id}
                onClick={() => setReaction(reaction === r.id ? null : r.id)}
                className={`border px-3 py-1.5 text-sm ${reaction === r.id ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={submit} className="bg-ink px-5 py-2 text-sm font-bold text-ink-foreground hover:bg-primary">
            Enviar avaliação
          </button>
        </div>
      )}
    </section>
  );
}
