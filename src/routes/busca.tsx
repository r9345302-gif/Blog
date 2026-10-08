import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { postsQuery } from "@/lib/api";
import { PostList } from "@/components/blog/PostCards";

export const Route = createFileRoute("/busca")({
  validateSearch: z.object({ q: z.string().catch("") }),
  head: () => ({
    meta: [
      { title: "Buscar artigos — Pauta" },
      { name: "description", content: "Encontre artigos por palavra-chave." },
      { property: "og:title", content: "Buscar artigos — Pauta" },
      { property: "og:description", content: "Encontre artigos por palavra-chave." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const [value, setValue] = useState(q);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ ...postsQuery({ search: q, limit: 30 }), enabled: q.trim().length > 1 });
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-4xl font-black">Buscar</h1>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/busca", search: { q: value } });
        }}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} className="h-12 flex-1 border border-input bg-card px-4 text-lg outline-none focus:border-primary" placeholder="Digite um assunto..." autoFocus />
        <button className="bg-primary px-6 font-bold text-primary-foreground">Buscar</button>
      </form>
      <div className="mt-10">
        {q.trim().length < 2 ? null : isLoading ? <p className="text-muted-foreground">Buscando...</p> : <PostList posts={data ?? []} empty={`Nada encontrado para "${q}".`} />}
      </div>
    </div>
  );
}
