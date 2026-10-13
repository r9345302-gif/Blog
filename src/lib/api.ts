import { queryOptions } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { defaultSettings, sampleNiches, samplePosts } from "./sample-data";
import type { Comment, Niche, Post, SiteSettings, Tag } from "./types";

const POST_COLS =
  "id,niche_id,title,slug,excerpt,meta_description,author_name,status,featured,word_count,published_at,created_at,niche:niches(id,name,slug,color),post_tags(tags(id,name,slug))";

type RawPost = Omit<Post, "tags"> & { post_tags?: { tags: Tag | null }[]; content?: string };

function normalize(p: RawPost): Post {
  const { post_tags, ...rest } = p;
  return {
    ...rest,
    content: p.content ?? "",
    tags: (post_tags ?? []).map((pt) => pt.tags).filter(Boolean) as Tag[],
  } as Post;
}

export async function fetchSettings(): Promise<SiteSettings> {
  if (!supabase) return defaultSettings;
  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  return data ? { ...defaultSettings, ...data } : defaultSettings;
}

export async function fetchNiches(): Promise<Niche[]> {
  if (!supabase) return sampleNiches;
  const { data, error } = await supabase.from("niches").select("*").eq("active", true).order("sort_order").order("name");
  if (error) {
    console.warn("[api] niches indisponível, usando dados de exemplo:", error.message);
    return sampleNiches;
  }
  return data as Niche[];
}

interface PostFilter {
  limit?: number;
  offset?: number;
  nicheId?: string | undefined;
  tagSlug?: string;
  search?: string;
}

function samplePostsFiltered(f: PostFilter, limit: number, offset: number): Post[] {
  let list = samplePosts;
  if (f.nicheId) list = list.filter((p) => p.niche_id === f.nicheId);
  if (f.tagSlug) list = list.filter((p) => p.tags?.some((t) => t.slug === f.tagSlug));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter((p) => (p.title + p.excerpt).toLowerCase().includes(q));
  }
  return list.slice(offset, offset + limit);
}

export async function fetchPosts(f: PostFilter = {}): Promise<Post[]> {
  const limit = f.limit ?? 12;
  const offset = f.offset ?? 0;
  if (!supabase) return samplePostsFiltered(f, limit, offset);
  let cols = POST_COLS;
  if (f.tagSlug) cols = cols.replace("post_tags(tags(", "post_tags!inner(tags!inner(");
  let q = supabase
    .from("posts")
    .select(cols)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (f.nicheId) q = q.eq("niche_id", f.nicheId);
  if (f.tagSlug) q = q.eq("post_tags.tags.slug", f.tagSlug);
  if (f.search) q = q.or(`title.ilike.%${f.search.replace(/[%,()]/g, " ")}%,excerpt.ilike.%${f.search.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await q;
  if (error) {
    console.warn("[api] posts indisponível, usando dados de exemplo:", error.message);
    return samplePostsFiltered(f, limit, offset);
  }
  return (data as unknown as RawPost[]).map(normalize);
}

export async function fetchPost(slug: string): Promise<Post | null> {
  if (!supabase) return samplePosts.find((p) => p.slug === slug) ?? null;
  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLS + ",content")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    console.warn("[api] post indisponível, usando dados de exemplo:", error.message);
    return samplePosts.find((p) => p.slug === slug) ?? null;
  }
  return data ? normalize(data as unknown as RawPost) : null;
}

export async function fetchTag(slug: string): Promise<Tag | null> {
  if (!supabase) {
    for (const p of samplePosts) {
      const t = p.tags?.find((x) => x.slug === slug);
      if (t) return t;
    }
    return null;
  }
  const { data } = await supabase.from("tags").select("*").eq("slug", slug).maybeSingle();
  return (data as Tag) ?? null;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at");
  if (error) throw error;
  return data as Comment[];
}

export interface RatingSummary {
  avg_relevance: number | null;
  total: number;
  adorei: number;
  util: number;
  neutro: number;
  fraco: number;
}

export async function fetchRatingSummary(postId: string): Promise<RatingSummary | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("post_rating_summary", { _post_id: postId });
  return (data?.[0] as RatingSummary) ?? null;
}

export const settingsQuery = () => queryOptions({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 60_000 });
export const nichesQuery = () => queryOptions({ queryKey: ["niches"], queryFn: fetchNiches, staleTime: 60_000 });
export const postsQuery = (f: PostFilter = {}) =>
  queryOptions({ queryKey: ["posts", f], queryFn: () => fetchPosts(f), staleTime: 30_000 });
export const postQuery = (slug: string) =>
  queryOptions({ queryKey: ["post", slug], queryFn: () => fetchPost(slug), staleTime: 30_000 });
export const tagQuery = (slug: string) => queryOptions({ queryKey: ["tag", slug], queryFn: () => fetchTag(slug) });
export const commentsQuery = (postId: string) =>
  queryOptions({ queryKey: ["comments", postId], queryFn: () => fetchComments(postId) });
export const ratingQuery = (postId: string) =>
  queryOptions({ queryKey: ["rating", postId], queryFn: () => fetchRatingSummary(postId) });

export function sessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("blog_sid");
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("blog_sid", id);
  }
  return id;
}

export function formatDate(iso: string | null, lang = "pt-BR") {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
