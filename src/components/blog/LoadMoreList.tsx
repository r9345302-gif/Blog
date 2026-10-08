import { useState } from "react";
import { fetchPosts } from "@/lib/api";
import type { Post } from "@/lib/types";
import { PostList } from "./PostCards";

export function LoadMoreList({
  initial,
  pageSize,
  filter = {},
}: {
  initial: Post[];
  pageSize: number;
  filter?: { nicheId?: string; tagSlug?: string };
}) {
  const [posts, setPosts] = useState(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [loading, setLoading] = useState(false);

  async function more() {
    setLoading(true);
    try {
      const next = await fetchPosts({ ...filter, limit: pageSize, offset: posts.length });
      const ids = new Set(posts.map((p) => p.id));
      const fresh = next.filter((p) => !ids.has(p.id));
      setPosts([...posts, ...fresh]);
      if (next.length < pageSize || !fresh.length) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PostList posts={posts} />
      {!done && (
        <div className="mt-10 text-center">
          <button onClick={more} disabled={loading} className="border border-input px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:opacity-50">
            {loading ? "Carregando..." : "Carregar mais artigos ›"}
          </button>
        </div>
      )}
    </>
  );
}
