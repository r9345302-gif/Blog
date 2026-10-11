/**
 * Writes sitemap.xml and robots.txt into the static output folder.
 * Run: node --experimental-strip-types scripts/build-sitemap.ts <outDir>
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "dist/client";
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: settings } = await db.from("site_settings").select("site_url").eq("id", 1).single();
const base = (process.env.SITE_URL || settings?.site_url || "").replace(/\/$/, "");
if (!base) console.warn("site_url vazio: defina o endereço do site em Configurações gerais.");

const [{ data: posts }, { data: niches }, { data: tags }] = await Promise.all([
  db.from("posts").select("slug,updated_at").eq("status", "published"),
  db.from("niches").select("slug").eq("active", true),
  db.from("tags").select("slug"),
]);

const urls = [
  { loc: "/", pri: "1.0" },
  ...(niches ?? []).map((n) => ({ loc: `/nicho/${n.slug}`, pri: "0.8" })),
  ...(posts ?? []).map((p) => ({ loc: `/post/${p.slug}`, pri: "0.7", mod: p.updated_at })),
  ...(tags ?? []).map((t) => ({ loc: `/tag/${t.slug}`, pri: "0.4" })),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u.loc}</loc>${"mod" in u && u.mod ? `<lastmod>${u.mod}</lastmod>` : ""}<priority>${u.pri}</priority></url>`).join("\n")}
</urlset>`;
writeFileSync(join(out, "sitemap.xml"), xml);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ""}`);
console.log(`sitemap: ${urls.length} URLs`);
