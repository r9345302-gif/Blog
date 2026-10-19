import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { nichesQuery, postsQuery, settingsQuery } from "@/lib/api";
import { FeaturedTile, ListCard, SectionTitle, SideCard } from "@/components/blog/PostCards";
import { LoadMoreList } from "@/components/blog/LoadMoreList";
import type { Niche, Post } from "@/lib/types";
import { loadSite, seoHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) => {
    const [site] = await Promise.all([
      loadSite(queryClient),
      queryClient.ensureQueryData(nichesQuery()),
      queryClient.ensureQueryData(postsQuery({ limit: 30 })),
    ]);
    return { site };
  },
  head: ({ loaderData }) => {
    const site = loaderData?.site;
    return seoHead({
      site,
      title: site ? `${site.name} — ${site.tagline}` : "Início",
      description: site?.about.slice(0, 160) || site?.tagline || "",
      path: "/",
      bareTitle: true,
    });
  },
  component: Home,
});

function Home() {
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const { data: niches } = useSuspenseQuery(nichesQuery());
  const { data: posts } = useSuspenseQuery(postsQuery({ limit: 30 }));

  if (!posts.length) {
    return <p className="mx-auto max-w-6xl px-4 py-24 text-center text-muted-foreground">Os primeiros artigos estão a caminho.</p>;
  }

  const featured = [...posts.filter((p) => p.featured), ...posts.filter((p) => !p.featured)].slice(0, 4);
  const featuredIds = new Set(featured.map((p) => p.id));
  const rest = posts.filter((p) => !featuredIds.has(p.id));

  return (
    <div className="mx-auto max-w-6xl px-4">
      {settings.home_layout
        .filter((b) => b.enabled)
        .map((block, i) => {
          if (block.type === "featured") return <Featured key={i} posts={featured} />;
          if (block.type === "latest")
            return (
              <Latest key={i} title={block.title ?? "Últimas publicações"} sidebarTitle={block.sidebar_title ?? "Mais recentes"} posts={rest.length ? rest : posts} />
            );
          if (block.type === "niches") return <NicheRows key={i} niches={niches} posts={posts} />;
          return null;
        })}
    </div>
  );
}

function Featured({ posts }: { posts: Post[] }) {
  const [a, b, c, d] = posts;
  return (
    <section className="mt-6 grid gap-1 md:h-[460px] md:grid-cols-2 md:grid-rows-2">
      {a && <div className="md:row-span-2"><FeaturedTile post={a} large /></div>}
      {b && <FeaturedTile post={b} />}
      <div className="grid grid-cols-2 gap-1">
        {c && <FeaturedTile post={c} />}
        {d && <FeaturedTile post={d} />}
      </div>
    </section>
  );
}

function Latest({ title, sidebarTitle, posts }: { title: string; sidebarTitle: string; posts: Post[] }) {
  const side = posts.slice(0, 5);
  return (
    <section className="mt-14 grid gap-12 lg:grid-cols-[1fr_300px]">
      <div>
        <SectionTitle>{title}</SectionTitle>
        <LoadMoreList initial={posts.slice(0, 10)} pageSize={10} />
      </div>
      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <SectionTitle>{sidebarTitle}</SectionTitle>
        {side[0] && (
          <div className="mb-6">
            <FeaturedTile post={side[0]} />
          </div>
        )}
        {side.slice(1).map((p) => (
          <SideCard key={p.id} post={p} />
        ))}
      </aside>
    </section>
  );
}

function NicheRows({ niches, posts }: { niches: Niche[]; posts: Post[] }) {
  return (
    <>
      {niches.map((n) => {
        const list = posts.filter((p) => p.niche_id === n.id).slice(0, 3);
        if (!list.length) return null;
        return (
          <section key={n.id} className="mt-16">
            <div className="flex items-end justify-between">
              <SectionTitle>{n.name}</SectionTitle>
              <Link to="/nicho/$slug" params={{ slug: n.slug }} className="mb-5 text-xs font-bold uppercase text-primary">
                Ver tudo →
              </Link>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {list.map((p) => (
                <div key={p.id} className="[&_article]:grid-cols-1">
                  <ListCard post={p} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
