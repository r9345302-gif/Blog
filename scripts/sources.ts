/**
 * Leitor de fontes do modo "Fontes de referência". Só roda no robô (Node) — o navegador não pode ler outros sites.
 *
 * Por rodada de um nicho:
 *  1. descobre páginas novas em cada fonte (feed RSS/Atom ou página de blog) e guarda em source_items (endereço único);
 *  2. lê as páginas novas mais antigas (até 3), extrai o texto principal, o título e a descrição da imagem;
 *  3. os links internos de cada página lida (mesmo site) entram na fila: são os "temas relacionados" do próprio blog.
 * Respeita o robots.txt, tem limite de tempo e de tamanho, e se identifica como robô.
 */
import type { Ctx, SourceItem } from "../src/lib/pipeline-core.ts";

type DB = any;

const UA = "PautaBot/1.0 (+leitor de referências de um blog; respeita robots.txt)";
const MAX_BYTES = 2_000_000;
const MAX_PER_RUN = 3;
const MIN_WORDS = 150;

// ------------------------------------------------------------------ funções puras (testadas)

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function isFeed(body: string): boolean {
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(body);
}

/** Endereços dos itens de um feed RSS ou Atom. */
export function parseFeed(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const link = /<link>([\s\S]*?)<\/link>/i.exec(m[0])?.[1];
    if (link) out.push(decode(link));
  }
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const link = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(m[0])?.[1] ?? /<link\b[^>]*href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (link) out.push(decode(link));
  }
  return [...new Set(out)];
}

const meta = (html: string, prop: string) =>
  new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i").exec(html)?.[1] ??
  new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i").exec(html)?.[1];

/** Texto principal, título e descrição da imagem de uma página de artigo. */
export function extractArticle(html: string): { title: string; text: string; imageAlt: string } {
  const title = decode(meta(html, "og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  let body = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  body = /<article\b[\s\S]*?<\/article>/i.exec(body)?.[0] ?? /<main\b[\s\S]*?<\/main>/i.exec(body)?.[0] ?? body;
  const parts: string[] = [];
  for (const m of body.matchAll(/<(h2|h3|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = stripTags(m[2]);
    if (t.split(" ").length >= (m[1].toLowerCase() === "p" ? 6 : 2)) parts.push(m[1].toLowerCase().startsWith("h") ? `## ${t}` : t);
  }
  let imageAlt = decode(meta(html, "og:image:alt") ?? "");
  if (!imageAlt) imageAlt = decode(/<img\b[^>]*alt=["']([^"']{10,})["']/i.exec(body)?.[1] ?? "");
  return { title, text: parts.join("\n\n"), imageAlt };
}

/** Links do mesmo site que parecem artigos (ignora tags, categorias, login, arquivos...). */
export function sameSiteLinks(html: string, pageUrl: string, max = 10): string[] {
  const base = new URL(pageUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(decode(m[1]), base);
    } catch {
      continue;
    }
    if (u.host !== base.host || !/^https?:$/.test(u.protocol)) continue;
    u.search = "";
    const path = u.pathname.replace(/\/+$/, "");
    if (path.length < 8 || path === base.pathname.replace(/\/+$/, "")) continue;
    if (/\/(tag|tags|category|categoria|author|autor|page|wp-admin|wp-login|login|feed|search|busca)(\/|$)/i.test(path)) continue;
    if (/\.(jpg|jpeg|png|gif|webp|pdf|zip|mp4|mp3|xml|css|js)$/i.test(path)) continue;
    out.add(u.toString());
    if (out.size >= max) break;
  }
  return [...out];
}

/** Regras do robots.txt para "*" (simplificado: Disallow/Allow por prefixo, o mais longo vence). */
export function robotsAllows(robots: string, path: string): boolean {
  let active = false;
  const rules: { allow: boolean; p: string }[] = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) active = v === "*";
    else if (active && /^disallow$/i.test(k) && v) rules.push({ allow: false, p: v });
    else if (active && /^allow$/i.test(k) && v) rules.push({ allow: true, p: v });
  }
  const hit = rules.filter((r) => path.startsWith(r.p.replace(/\*.*$/, ""))).sort((a, b) => b.p.length - a.p.length)[0];
  return hit ? hit.allow : true;
}

// ------------------------------------------------------------------ rede

async function get(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const buf = await res.arrayBuffer();
  return { ok: res.ok, status: res.status, body: new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf) };
}

const robotsCache = new Map<string, string>();
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    try {
      const r = await get(`${u.origin}/robots.txt`);
      robotsCache.set(u.origin, r.ok ? r.body : "");
    } catch {
      robotsCache.set(u.origin, "");
    }
  }
  return robotsAllows(robotsCache.get(u.origin)!, u.pathname);
}

async function enqueue(db: DB, nicheId: string, urls: string[]) {
  if (!urls.length) return;
  await db.from("source_items").upsert(urls.map((url) => ({ niche_id: nicheId, url })), { onConflict: "niche_id,url", ignoreDuplicates: true });
}

/** Descobre páginas novas nas fontes do nicho e devolve até 3 páginas lidas e prontas para a reescrita. */
export async function fetchSourcesFor(c: Ctx): Promise<SourceItem[]> {
  const db = c.db;
  const sources = (c.niche.sources ?? []).map((s) => String(s).trim()).filter((s) => /^https?:\/\//i.test(s)).slice(0, 10);
  if (!sources.length) throw new Error("O modo Fontes de referência está ligado, mas o nicho não tem nenhuma fonte cadastrada.");

  // 1. Descoberta
  for (const src of sources) {
    try {
      if (!(await allowed(src))) {
        console.log(`  fonte bloqueia robôs (robots.txt): ${src}`);
        continue;
      }
      const r = await get(src);
      if (!r.ok) {
        console.log(`  fonte inacessível (${r.status}): ${src}`);
        continue;
      }
      if (isFeed(r.body)) await enqueue(db, c.niche.id, parseFeed(r.body).slice(0, 20));
      else {
        const art = extractArticle(r.body);
        // A própria página é um artigo? Entra. E os links dela também (página inicial de blog, listas...).
        await enqueue(db, c.niche.id, [...(art.text.split(/\s+/).length >= MIN_WORDS ? [src] : []), ...sameSiteLinks(r.body, src, 20)]);
      }
    } catch (e) {
      console.log(`  fonte inacessível: ${src} (${e instanceof Error ? e.message : e})`);
    }
  }

  // 2. Leitura das páginas novas (mais antigas primeiro)
  const { data: queue } = await db.from("source_items").select("id,url").eq("niche_id", c.niche.id).eq("status", "new").order("created_at").limit(12);
  const out: SourceItem[] = [];
  for (const q of queue ?? []) {
    if (out.length >= MAX_PER_RUN) break;
    try {
      if (!(await allowed(q.url))) {
        await db.from("source_items").update({ status: "skipped", error: "bloqueado pelo robots.txt" }).eq("id", q.id);
        continue;
      }
      const r = await get(q.url);
      if (!r.ok) throw new Error(`respondeu ${r.status}`);
      const art = extractArticle(r.body);
      if (art.text.split(/\s+/).length < MIN_WORDS) {
        await db.from("source_items").update({ status: "skipped", title: art.title.slice(0, 300), error: "pouco texto (página de lista, paywall ou montada por JavaScript)" }).eq("id", q.id);
        continue;
      }
      await db.from("source_items").update({ title: art.title.slice(0, 300) }).eq("id", q.id);
      // 3. Temas relacionados dentro do próprio blog
      await enqueue(db, c.niche.id, sameSiteLinks(r.body, q.url, 10));
      out.push({ id: q.id, url: q.url, title: art.title, text: art.text, image_alt: art.imageAlt || undefined });
    } catch (e) {
      await db.from("source_items").update({ status: "error", error: `fonte inacessível: ${e instanceof Error ? e.message : e}`.slice(0, 300) }).eq("id", q.id);
    }
  }
  return out;
}
