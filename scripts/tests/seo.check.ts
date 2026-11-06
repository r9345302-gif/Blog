/** Regras de SEO usadas pelo sitemap. Rodar: node --experimental-strip-types --test scripts/tests/*.check.ts */
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexableTagSlugs, latestByNiche } from "../../src/lib/seo-rules.ts";

test("sitemap: tag com menos de 3 posts publicados fica fora; rascunhos não contam", () => {
  const tags = [
    { id: "a", slug: "tres" },
    { id: "b", slug: "duas" },
    { id: "c", slug: "nenhuma" },
  ];
  const pt = [
    { post_id: "p1", tag_id: "a" }, { post_id: "p2", tag_id: "a" }, { post_id: "p3", tag_id: "a" },
    { post_id: "p1", tag_id: "b" }, { post_id: "p2", tag_id: "b" }, { post_id: "rascunho", tag_id: "b" },
  ];
  assert.deepEqual(indexableTagSlugs(tags, pt, ["p1", "p2", "p3"]), ["tres"]);
});

test("sitemap: lastmod do nicho e da home é o post mais recente", () => {
  const m = latestByNiche([
    { niche_id: "n1", published_at: "2026-01-01T00:00:00Z" },
    { niche_id: "n1", published_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
    { niche_id: "n2", published_at: "2026-01-03T00:00:00Z" },
  ]);
  assert.equal(m.get("n1"), "2026-01-05T00:00:00Z");
  assert.equal(m.get("n2"), "2026-01-03T00:00:00Z");
  assert.equal(m.get("*"), "2026-01-05T00:00:00Z");
});
