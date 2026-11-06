/**
 * Regras de SEO sem dependências (usadas pelo site e por scripts/build-sitemap.ts).
 * Não importe nada aqui: o arquivo também roda direto no Node pelo GitHub Actions.
 */

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
/** Tags com menos artigos publicados que isso ficam fora do Google (noindex) e do sitemap. */
export const THIN_TAG_MIN = 3;
export const ARTICLE_ROBOTS = "index,follow,max-image-preview:large";

/** Corta o texto no limite de palavra e acrescenta "…" só quando cortou. Textos curtos voltam iguais. */
export function clampText(text: string, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if ([...t].length <= max) return t;
  const chars = [...t].slice(0, max - 1).join("");
  const space = chars.lastIndexOf(" ");
  const cut = (space > max * 0.4 ? chars.slice(0, space) : chars).replace(/[\s.,;:!?—–-]+$/u, "");
  return `${cut}…`;
}

/** Título da aba: "Título — Site" quando cabe em 60; senão só o título (cortado se preciso). */
export function buildTitle(title: string, siteName: string, bare = false): string {
  const t = (title ?? "").trim();
  if (bare || !siteName) return clampText(t, TITLE_MAX);
  const full = `${t} — ${siteName}`;
  return [...full].length <= TITLE_MAX ? full : clampText(t, TITLE_MAX);
}

export const isThinTag = (publishedCount: number) => publishedCount < THIN_TAG_MIN;

/** "Atualizado em" e dateModified só aparecem se a atualização veio 24h ou mais depois da publicação. */
export function wasUpdated(published?: string | null, updated?: string | null): boolean {
  if (!published || !updated) return false;
  const a = Date.parse(published);
  const b = Date.parse(updated);
  return Number.isFinite(a) && Number.isFinite(b) && b - a >= 24 * 3600 * 1000;
}

/** Slugs das tags com pelo menos THIN_TAG_MIN posts publicados. */
export function indexableTagSlugs(
  tags: { id: string; slug: string }[],
  postTags: { post_id: string; tag_id: string }[],
  publishedPostIds: Iterable<string>,
): string[] {
  const published = new Set(publishedPostIds);
  const count = new Map<string, number>();
  for (const pt of postTags) if (published.has(pt.post_id)) count.set(pt.tag_id, (count.get(pt.tag_id) ?? 0) + 1);
  return tags.filter((t) => !isThinTag(count.get(t.id) ?? 0)).map((t) => t.slug);
}

/** Data do post mais recente de cada nicho (e do site todo em "*"). */
export function latestByNiche(posts: { niche_id?: string | null; published_at?: string | null; updated_at?: string | null }[]): Map<string, string> {
  const out = new Map<string, string>();
  const keep = (k: string, d: string) => {
    const cur = out.get(k);
    if (!cur || Date.parse(d) > Date.parse(cur)) out.set(k, d);
  };
  for (const p of posts) {
    const d = p.updated_at || p.published_at;
    if (!d || !Number.isFinite(Date.parse(d))) continue;
    keep("*", d);
    if (p.niche_id) keep(p.niche_id, d);
  }
  return out;
}
