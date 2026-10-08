import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { nichesQuery, postsQuery } from "@/lib/api";
import { SectionTitle } from "@/components/blog/PostCards";
import { LoadMoreList } from "@/components/blog/LoadMoreList";

export const Route = createFileRoute("/nicho/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    const niches = await queryClient.ensureQueryData(nichesQuery());
    const niche = niches.find((n) => n.slug === params.slug);
    if (!niche) throw notFound();
    await queryClient.ensureQueryData(postsQuery({ nicheId: niche.id, limit: 12 }));
    return { name: niche.name, description: niche.description };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Assunto não encontrado" }, { name: "robots", content: "noindex" }] };
    const title = `${loaderData.name} — Pauta`;
    const desc = loaderData.description || `Artigos sobre ${loaderData.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: NichePage,
});

function NichePage() {
  const { slug } = Route.useParams();
  const { data: niches } = useSuspenseQuery(nichesQuery());
  const niche = niches.find((n) => n.slug === slug)!;
  const { data: posts } = useSuspenseQuery(postsQuery({ nicheId: niche.id, limit: 12 }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Assunto</p>
      <h1 className="mt-2 text-5xl font-black tracking-tight">{niche.name}</h1>
      {niche.description && <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{niche.description}</p>}
      <div className="mt-12">
        <SectionTitle>Artigos</SectionTitle>
        <LoadMoreList key={niche.id} initial={posts} pageSize={12} filter={{ nicheId: niche.id }} />
      </div>
    </div>
  );
}
