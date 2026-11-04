/**
 * Testes do modo "Fontes de referência": leitura de páginas, checagens de cópia/números e o ciclo completo.
 * Rodar: node --experimental-strip-types --test scripts/tests/*.check.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { copiedPhrases, inventedNumbers, NothingNewError, runNiche } from "../../src/lib/pipeline-core.ts";
import { extractArticle, isFeed, parseFeed, robotsAllows, sameSiteLinks } from "../sources.ts";
import { imageProvider } from "../covers.ts";
import { createFakeGemini } from "./support/fake-gemini.mjs";
import { createClient } from "./support/fake-supabase.mjs";
import { D, freshDb, iso, niche } from "./support/sim.ts";

const g = globalThis as any;

test("feed RSS e Atom: pega os endereços dos itens", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title>A</title><link>https://b.com/a</link></item><item><link><![CDATA[https://b.com/b]]></link></item></channel></rss>`;
  assert.equal(isFeed(rss), true);
  assert.deepEqual(parseFeed(rss), ["https://b.com/a", "https://b.com/b"]);
  const atom = `<feed><entry><link rel="alternate" href="https://b.com/c"/></entry></feed>`;
  assert.deepEqual(parseFeed(atom), ["https://b.com/c"]);
  assert.equal(isFeed("<!doctype html><html></html>"), false);
});

test("extractArticle: texto do <article>, sem menu/rodapé, com título e descrição da imagem", () => {
  const html = `<html><head><meta property="og:title" content="Título X"><meta property="og:image:alt" content="Um notebook na mesa"></head>
  <body><nav><p>menu menu menu menu menu menu menu</p></nav><article><h2>Seção</h2><p>Este é um parágrafo com bastante texto real aqui.</p></article>
  <footer><p>rodapé rodapé rodapé rodapé rodapé rodapé</p></footer></body></html>`;
  const a = extractArticle(html);
  assert.equal(a.title, "Título X");
  assert.equal(a.imageAlt, "Um notebook na mesa");
  assert.equal(a.text, "## Seção\n\nEste é um parágrafo com bastante texto real aqui.");
});

test("sameSiteLinks: só links do mesmo site que parecem artigos", () => {
  const html = `<a href="/2024/meu-artigo">a</a><a href="https://outro.com/x-artigo">b</a><a href="/tag/abc">c</a><a href="/img/foto.jpg">d</a><a href="/">e</a>`;
  assert.deepEqual(sameSiteLinks(html, "https://b.com/"), ["https://b.com/2024/meu-artigo"]);
});

test("robots.txt: respeita Disallow e Allow para todos os robôs", () => {
  const r = "User-agent: *\nDisallow: /privado\nAllow: /privado/ok\n\nUser-agent: Outro\nDisallow: /";
  assert.equal(robotsAllows(r, "/blog/x"), true);
  assert.equal(robotsAllows(r, "/privado/a"), false);
  assert.equal(robotsAllows(r, "/privado/ok/b"), true);
});

test("checagem de cópia: acha trechos de 6 palavras iguais ao original", () => {
  const orig = "O novo celular tem bateria de longa duração e tela grande.";
  assert.equal(copiedPhrases("Escrevi algo totalmente diferente sobre telefones.", [orig]).length, 0);
  assert.ok(copiedPhrases("Veja: o novo celular tem bateria de longa duração!", [orig]).length >= 1);
});

test("números inventados: aponta valores que não estão nas fontes (ignora 0 a 10)", () => {
  const orig = "Custa R$ 1.299 e foi lançado em 2019.";
  assert.deepEqual(inventedNumbers("Por R$ 1299, desde 2019, com 3 cores.", [orig]), []);
  assert.deepEqual(inventedNumbers("Por R$ 4.999 desde 2019.", [orig]), ["4999"]);
});

test("gerador de capas: Cloudflare (grátis) quando há chave; IMAGE_PROVIDER força a escolha", () => {
  assert.equal(imageProvider({}), "gemini");
  assert.equal(imageProvider({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" }), "cloudflare");
  assert.equal(imageProvider({ IMAGE_PROVIDER: "pollinations", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" }), "pollinations");
});

// ---------------------------------------------------------------- ciclo completo com fonte falsa
const SOURCE_TEXT = "O aparelho custa R$ 1.299 desde 2019 e traz bateria reforçada para quem viaja muito. " + "Mais detalhes técnicos sobre o produto analisado aqui. ".repeat(30);

async function world(nicheExtra: Record<string, unknown>, gem: Record<string, string>, items = 1) {
  const db = freshDb();
  db.source_items = [];
  db.niches.push(niche("Tech", { next_run_at: iso(D(0, 9)), source_mode: true, sources: ["https://b.com/feed"], ...nicheExtra }));
  const st: any = { now: D(0, 9), db, idc: 0, lock: 0, calls: 0 };
  g.__SIM = { st };
  const realFetch = g.fetch;
  const realTimeout = g.setTimeout;
  g.fetch = createFakeGemini({ st, behaviors: gem });
  g.setTimeout = (cb: () => void) => { queueMicrotask(cb); return 0; };
  const fetchSources = async () => {
    const out = [];
    for (let i = 0; i < items; i++) {
      const row = { id: "s" + i, niche_id: "n-Tech", url: `https://b.com/p${i}`, status: "new" };
      db.source_items.push(row);
      out.push({ id: row.id, url: row.url, title: `Original ${i}`, text: SOURCE_TEXT });
    }
    return out;
  };
  const ctx = { db: createClient(), gemini: { apiKey: "k", model: "m" }, niche: db.niches[0], settings: db.site_settings[0], source: "robot" as const, fetchSources };
  return { st, ctx, restore: () => { g.fetch = realFetch; g.setTimeout = realTimeout; } };
}

test("modo fontes: reescreve, cita a fonte, guarda a palavra-chave da foto e não reutiliza a página", async () => {
  const w = await world({ min_words: 600 }, {});
  try {
    const r = await runNiche(w.ctx);
    assert.equal(r.status, "published");
    const post = w.st.db.posts[0];
    assert.match(post.content, /\*\*Fontes consultadas:\*\* \[Original 0\]\(https:\/\/b\.com\/p0\)/);
    assert.deepEqual(post.source_urls, ["https://b.com/p0"]);
    assert.equal(post.photo_keyword, "laptop");
    assert.equal(w.st.db.source_items[0].status, "used");
    assert.equal(w.st.db.ideas.length, 0, "não usa o brainstorm");
  } finally { w.restore(); }
});

test("modo fontes: sem citar fontes quando desligado", async () => {
  const w = await world({ min_words: 600, cite_sources: false }, {});
  try {
    await runNiche(w.ctx);
    assert.ok(!w.st.db.posts[0].content.includes("Fontes consultadas"));
  } finally { w.restore(); }
});

test("modo fontes: texto copiado vai para revisão, mesmo com publicação automática", async () => {
  const w = await world({ min_words: 600 }, { "*": "copia" });
  try {
    assert.equal((await runNiche(w.ctx)).status, "pending");
    assert.ok(w.st.db.pipeline_runs.some((x: any) => /trechos iguais ao original/.test(x.message)));
  } finally { w.restore(); }
});

test("modo fontes: número que não está na fonte vai para revisão", async () => {
  const w = await world({ min_words: 600 }, { "*": "inventa" });
  try {
    assert.equal((await runNiche(w.ctx)).status, "pending");
    assert.ok(w.st.db.pipeline_runs.some((x: any) => /números que não estão nas fontes: 4999/.test(x.message)));
  } finally { w.restore(); }
});

test("modo fontes: sem página nova não é falha (NothingNewError)", async () => {
  const w = await world({}, {}, 0);
  try {
    await assert.rejects(() => runNiche(w.ctx), NothingNewError);
  } finally { w.restore(); }
});

test("modo fontes desligado: continua o fluxo normal de ideias", async () => {
  const w = await world({ source_mode: false, min_words: 1200 }, {});
  try {
    await runNiche(w.ctx);
    assert.equal(w.st.db.ideas.length, 5);
  } finally { w.restore(); }
});
