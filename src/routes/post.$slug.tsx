import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDate, postQuery, postsQuery, settingsQuery } from "@/lib/api";
import { Cover, NicheBadge } from "@/components/blog/Cover";
import { SectionTitle, SideCard } from "@/components/blog/PostCards";
import { Comments } from "@/components/blog/Comments";
import { Rating } from "@/components/blog/Rating";
import { useTrackView } from "@/components/blog/useTrackView";
import { siteOrigin } from "@/lib/utils";

export const Route = createFileRoute("/post/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    const post = await queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) throw notFound();
    const settings = await queryClient.ensureQueryData(settingsQuery());
    await queryClient.ensureQueryData(postsQuery({ nicheId: post.niche_id ?? undefined, limit: 6 }));
    return {
      title: post.title,
      description: post.meta_description || post.excerpt,
      author: post.author_name,
      published: post.published_at,
      siteName: settings.site_name,
      url: settings.site_url ? `${siteOrigin(settings.site_url)}/post/${post.slug}` : "",
      lang: settings.language,
      tags: (post.tags ?? []).map((t) => t.name),
    };
  },
  head: ({ loaderData: d }) => {
    if (!d) return { meta: [{ title: "Artigo não encontrado" }, { name: "robots", content: "noindex" }] };
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: d.title,
      description: d.description,
      author: { "@type": "Person", name: d.author },
      datePublished: d.published,
      inLanguage: d.lang,
      keywords: d.tags.join(", "),
      publisher: { "@type": "Organization", name: d.siteName },
      ...(d.url ? { mainEntityOfPage: d.url } : {}),
    };
    return {
      meta: [
        { title: `${d.title} — ${d.siteName}` },
        { name: "description", content: d.description },
        { name: "author", content: d.author },
        { property: "og:title", content: d.title },
        { property: "og:description", content: d.description },
        { property: "og:type", content: "article" },
        { property: "article:published_time", content: d.published ?? "" },
        { name: "twitter:card", content: "summary" },
        ...(d.url ? [{ property: "og:url", content: d.url }] : []),
      ],
      links: d.url ? [{ rel: "canonical", href: d.url }] : [],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { slug } = Route.useParams();
  const { data: post } = useSuspenseQuery(postQuery(slug));
  const { data: related } = useSuspenseQuery(postsQuery({ nicheId: post!.niche_id ?? undefined, limit: 6 }));
  useTrackView(post!.id, `/post/${slug}`);
  if (!post) return null;
  const others = related.filter((p) => p.id !== post.id).slice(0, 5);
  const minutes = Math.max(1, Math.round((post.word_count || post.content.split(/\s+/).length) / 220));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
        <article>
          <NicheBadge post={post} />
          <h1 className="mt-3 text-4xl font-black leading-[1.1] tracking-tight md:text-5xl">{post.title}</h1>
          {post.excerpt && <p className="mt-4 font-serif text-xl text-muted-foreground">{post.excerpt}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{post.author_name}</span>
            <span>·</span>
            <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
            <span>·</span>
            <span>{minutes} min de leitura</span>
          </div>
          <Cover post={post} size="lg" className="mt-8 aspect-[21/9]" />
          <div className="prose-article mt-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          </div>
          {!!post.tags?.length && (
            <div className="mt-10 flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <Link key={t.id} to="/tag/$slug" params={{ slug: t.slug }} className="border px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary">
                  #{t.name}
                </Link>
              ))}
            </div>
          )}
          <Rating postId={post.id} />
          <Comments postId={post.id} />
        </article>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <SectionTitle>Leia também</SectionTitle>
          {others.map((p) => (
            <SideCard key={p.id} post={p} />
          ))}
        </aside>
      </div>
    </div>
  );
}
