import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { formatDate, postsQuery } from "@/lib/api";
import { loadSite, seoHead } from "@/lib/seo";

// Lists every published post so search engines (and the static build crawler) can reach them all.
export const Route = createFileRoute("/arquivo")({
  loader: async ({ context: { queryClient } }) => {
    const [site] = await Promise.all([loadSite(queryClient), queryClient.ensureQueryData(postsQuery({ limit: 1000 }))]);
    return { site };
  },
  head: ({ loaderData }) =>
    seoHead({ site: loaderData?.site, title: "Todos os artigos", description: "Arquivo completo com todos os artigos publicados.", path: "/arquivo" }),
  component: Archive,
});

function Archive() {
  const { data: posts } = useSuspenseQuery(postsQuery({ limit: 1000 }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black">Todos os artigos</h1>
      <ul className="mt-8 divide-y">
        {posts.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-4 py-3">
            <Link to="/post/$slug" params={{ slug: p.slug }} className="font-semibold hover:text-primary">{p.title}</Link>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(p.published_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
