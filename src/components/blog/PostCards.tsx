import { Link } from "@tanstack/react-router";
import type { Post } from "@/lib/types";
import { formatDate } from "@/lib/api";
import { Cover, NicheBadge } from "./Cover";

export function Meta({ post }: { post: Post }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">{post.author_name}</span>
      <span className="mx-1.5">·</span>
      <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
    </div>
  );
}

export function FeaturedTile({ post, large }: { post: Post; large?: boolean }) {
  return (
    <Link to="/post/$slug" params={{ slug: post.slug }} className="group relative block h-full min-h-[220px] overflow-hidden">
      <Cover post={post} size={large ? "lg" : "md"} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <NicheBadge post={post} />
        <h2 className={`mt-2 font-bold leading-tight text-ink-foreground ${large ? "text-2xl md:text-3xl" : "text-lg"}`}>
          {post.title}
        </h2>
      </div>
    </Link>
  );
}

export function ListCard({ post }: { post: Post }) {
  return (
    <article className="grid gap-5 sm:grid-cols-[220px_1fr]">
      <Link to="/post/$slug" params={{ slug: post.slug }} className="block aspect-[16/10] overflow-hidden">
        <Cover post={post} size="sm" className="h-full w-full" />
      </Link>
      <div>
        <Link to="/post/$slug" params={{ slug: post.slug }}>
          <h3 className="text-xl font-bold leading-snug hover:text-primary">{post.title}</h3>
        </Link>
        <div className="mt-1.5">
          <Meta post={post} />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
      </div>
    </article>
  );
}

export function SideCard({ post }: { post: Post }) {
  return (
    <Link to="/post/$slug" params={{ slug: post.slug }} className="group grid grid-cols-[80px_1fr] gap-3">
      <Cover post={post} size="sm" className="aspect-[4/3]" />
      <div>
        <p className="text-sm font-semibold leading-snug group-hover:text-primary">{post.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(post.published_at)}</p>
      </div>
    </Link>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b-2 border-ink">
      <h2 className="inline-block bg-ink px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-foreground">
        {children}
      </h2>
    </div>
  );
}

export function PostList({ posts, empty = "Nenhum artigo por aqui ainda." }: { posts: Post[]; empty?: string }) {
  if (!posts.length) return <p className="py-10 text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-9">
      {posts.map((p) => (
        <ListCard key={p.id} post={p} />
      ))}
    </div>
  );
}
