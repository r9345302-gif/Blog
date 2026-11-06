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
import { loadSite, seoHead } from "@/lib/seo";
import { withBase } from "@/lib/utils";
import { ARTICLE_ROBOTS, wasUpdated } from "@/lib/seo-rules";

export const Route = createFileRoute("/post/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    const post = await queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) throw notFound();
    const site = await loadSite(queryClient);
    await queryClient.ensureQueryData(postsQuery({ nicheId: post.niche_id ?? undefined, limit: 6 }));
    return {
      slug: post.slug,
      title: post.title,
      description: post.meta_description || post.excerpt,
      author: post.author_name,
      published: post.published_at,
      modified: post.updated_at ?? post.published_at,
      image: post.cover_url || "",
      site,
      tags: (post.tags ?? []).map((t) => t.name),
      imageAlt: post.cover_alt?.trim() || post.title,
      nicheName: post.niche?.name ?? "",
      nicheSlug: post.niche?.slug ?? "",
      wordCount: post.word_count || post.content.split(/\s+/).filter(Boolean).length,
    };
  },
  head: ({ loaderData: d }) => {
    if (!d) return { meta: [{ title: "Artigo não encontrado" }, { name: "robots", content: "noindex" }] };
    const seo = seoHead({
      site: d.site,
      title: d.title,
      description: d.description,
      path: `/post/${d.slug}`,
      type: "article",
      image: d.image,
      robots: ARTICLE_ROBOTS,
      imageAlt: d.image ? d.imageAlt : undefined,
      articleSection: d.nicheName || undefined,
      articleTags: d.tags,
    });
    const origin = d.site.origin;
    const url = origin ? `${origin}/post/${d.slug}` : "";
    const updated = wasUpdated(d.published, d.modified);
    const abs = (u: string) => (/^https?:\/\//i.test(u) ? u : "");
    const image = abs(d.image);
    const logo = abs(d.site.ogImage);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: d.title,
      description: d.description,
      author: { "@type": "Person", name: d.author },
      datePublished: d.published,
      ...(updated ? { dateModified: d.modified } : {}),
      ...(image ? { image: [image] } : {}),
      inLanguage: d.site.lang,
      keywords: d.tags.join(", "),
      ...(d.nicheName ? { articleSection: d.nicheName } : {}),
      ...(d.wordCount ? { wordCount: d.wordCount } : {}),
      publisher: {
        "@type": "Organization",
        name: d.site.name,
        ...(origin ? { url: `${origin}/` } : {}),
        ...(logo ? { logo: { "@type": "ImageObject", url: logo } } : {}),
      },
      ...(url ? { mainEntityOfPage: url } : {}),
    };
    const crumbs = [
      { name: "Início", item: origin ? `${origin}/` : "" },
      ...(d.nicheSlug ? [{ name: d.nicheName, item: origin ? `${origin}/nicho/${d.nicheSlug}` : "" }] : []),
      { name: d.title, item: url },
    ];
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.item ? { item: c.item } : {}) })),
    };
    return {
      meta: [
        ...seo.meta,
        { name: "author", content: d.author },
        { property: "article:published_time", content: d.published ?? "" },
        ...(updated && d.modified ? [{ property: "article:modified_time", content: d.modified }] : []),
      ],
      links: seo.links,
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbLd) },
      ],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { slug } = Route.useParams();
  const { data: post } = useSuspenseQuery(postQuery(slug));
  const { data: related } = useSuspenseQuery(postsQuery({ nicheId: post!.niche_id ?? undefined, limit: 6 }));
  const { data: settings } = useSuspenseQuery(settingsQuery());
  useTrackView(post!.id, `/post/${slug}`);
  if (!post) return null;
  const others = related.filter((p) => p.id !== post.id).slice(0, 5);
  const minutes = Math.max(1, Math.round((post.word_count || post.content.split(/\s+/).length) / 220));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
        <article>
          {post.niche && (
            <nav aria-label="Trilha de navegação" className="mb-3 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-primary">Início</Link>
              <span className="mx-1.5">›</span>
              <Link to="/nicho/$slug" params={{ slug: post.niche.slug }} className="hover:text-primary">{post.niche.name}</Link>
            </nav>
          )}
          <NicheBadge post={post} />
          <h1 className="mt-3 text-4xl font-black leading-[1.1] tracking-tight md:text-5xl">{post.title}</h1>
          {post.excerpt && <p className="mt-4 font-serif text-xl text-muted-foreground">{post.excerpt}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{post.author_name}</span>
            <span>·</span>
            <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
            {wasUpdated(post.published_at, post.updated_at) && (
              <>
                <span>·</span>
                <span>
                  Atualizado em <time dateTime={post.updated_at ?? undefined}>{formatDate(post.updated_at ?? null)}</time>
                </span>
              </>
            )}
            <span>·</span>
            <span>{minutes} min de leitura</span>
          </div>
          <figure className="mt-8">
            <Cover post={post} size="lg" full className="aspect-[21/9]" />
            {post.cover_url && settings.cover_caption?.trim() && <figcaption className="mt-2 text-xs text-muted-foreground">{settings.cover_caption}</figcaption>}
            {post.cover_url && post.cover_credit?.trim() && <figcaption className="mt-1 text-xs text-muted-foreground">{post.cover_credit}</figcaption>}
          </figure>
          <div className="prose-article mt-10">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Links internos (/post/...) vindos do texto precisam do prefixo da subpasta; links externos abrem em nova aba.
                a: ({ href, children }) =>
                  href && href.startsWith("/") && !href.startsWith("//") ? (
                    <a href={withBase(href)}>{children}</a>
                  ) : (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {children}
                    </a>
                  ),
              }}
            >
              {post.content}
            </ReactMarkdown>
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
          {settings.ai_disclosure?.trim() && (
            <p className="mt-8 border-l-4 border-border pl-4 text-sm text-muted-foreground">{settings.ai_disclosure}</p>
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
