import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { postsQuery, tagQuery } from "@/lib/api";
import { SectionTitle } from "@/components/blog/PostCards";
import { LoadMoreList } from "@/components/blog/LoadMoreList";
import { loadSite, seoHead } from "@/lib/seo";

export const Route = createFileRoute("/tag/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    const [tag, site] = await Promise.all([queryClient.ensureQueryData(tagQuery(params.slug)), loadSite(queryClient)]);
    if (!tag) throw notFound();
    await queryClient.ensureQueryData(postsQuery({ tagSlug: params.slug, limit: 12 }));
    return { name: tag.name, slug: params.slug, site };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Tag não encontrada" }, { name: "robots", content: "noindex" }] };
    return seoHead({
      site: loaderData.site,
      title: `#${loaderData.name}`,
      description: `Todos os artigos marcados com ${loaderData.name}.`,
      path: `/tag/${loaderData.slug}`,
    });
  },
  component: TagPage,
});

function TagPage() {
  const { slug } = Route.useParams();
  const { data: tag } = useSuspenseQuery(tagQuery(slug));
  const { data: posts } = useSuspenseQuery(postsQuery({ tagSlug: slug, limit: 12 }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Tag</p>
      <h1 className="mt-2 text-5xl font-black tracking-tight">#{tag?.name}</h1>
      <div className="mt-12">
        <SectionTitle>Artigos</SectionTitle>
        <LoadMoreList key={slug} initial={posts} pageSize={12} filter={{ tagSlug: slug }} />
      </div>
    </div>
  );
}
