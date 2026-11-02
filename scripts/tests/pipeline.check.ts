/**
 * Testes do PIPELINE de IA (src/lib/pipeline-core.ts): funções puras, a chamada ao Gemini e o ciclo completo de um nicho,
 * com banco e Gemini falsos. Sem internet.
 * Rodar: node --experimental-strip-types --test scripts/tests/*.check.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blocksToMarkdown, callGemini, isFlatMarkdown, nextRun, QuotaError, reformatFlatContent, runNiche, slugify, TransientError, validTimeZone,
} from "../../src/lib/pipeline-core.ts";
import { createFakeGemini } from "./support/fake-gemini.mjs";
import { createClient } from "./support/fake-supabase.mjs";
import { D, freshDb, iso, niche } from "./support/sim.ts";

const g = globalThis as any;

// ---------------------------------------------------------------- funções puras
test("slugify: sem acentos, minúsculo, com hífens e no máximo 80 caracteres", () => {
  assert.equal(slugify("Ações & Finanças: Guia Completo (2026)!"), "acoes-financas-guia-completo-2026");
  assert.ok(slugify("palavra ".repeat(40)).length <= 80);
  assert.equal(slugify("  --Olá,   mundo--  "), "ola-mundo");
});

test("nextRun: próxima publicação no horário certo, em UTC e em outros fusos (inclusive horário de verão)", () => {
  const n = (d: number, h: number) => ({ interval_days: d, publish_hour: h }) as any;
  assert.equal(nextRun(n(1, 9), new Date("2026-10-16T11:05:00Z")), "2026-10-17T09:00:00.000Z");
  assert.equal(nextRun(n(1, 9), new Date("2026-10-16T11:05:00Z"), "America/Sao_Paulo"), "2026-10-17T12:00:00.000Z");
  assert.equal(nextRun(n(1, 9), new Date("2026-10-16T11:05:00Z"), "Asia/Jakarta"), "2026-10-17T02:00:00.000Z");
  assert.equal(nextRun(n(1, 9), new Date("2026-10-16T23:30:00Z"), "Asia/Jakarta"), "2026-10-18T02:00:00.000Z", "já é o dia seguinte no fuso");
  assert.equal(nextRun(n(3, 9), new Date("2026-10-16T11:05:00Z"), "Europe/Lisbon"), "2026-10-19T08:00:00.000Z");
  assert.equal(nextRun(n(1, 9), new Date("2026-10-31T20:00:00Z"), "America/New_York"), "2026-11-01T14:00:00.000Z", "fim do horário de verão");
  assert.equal(nextRun(n(1, 9), new Date("2026-10-16T11:05:00Z"), "Marte/Olympus"), "2026-10-17T09:00:00.000Z", "fuso inválido vira UTC");
});

test("validTimeZone", () => {
  assert.equal(validTimeZone("  "), "UTC");
  assert.equal(validTimeZone(undefined), "UTC");
  assert.equal(validTimeZone("America/Sao_Paulo"), "America/Sao_Paulo");
  assert.equal(validTimeZone("Marte/Olympus"), "UTC");
});

test("blocksToMarkdown: títulos, parágrafos, listas e citações viram Markdown com quebras de linha garantidas", () => {
  const md = blocksToMarkdown([
    { type: "h2", text: "Seção" }, { type: "p", text: "Um parágrafo." }, { type: "h3", text: "## Sub" },
    { type: "ul", items: ["a", "b"] }, { type: "ol", items: ["x", "y"] }, { type: "quote", text: "Citação" },
  ]);
  assert.equal(md, "## Seção\n\nUm parágrafo.\n\n### Sub\n\n- a\n- b\n\n1. x\n2. y\n\n> Citação");
  assert.equal(blocksToMarkdown([{ type: "p", text: "linha 1\n\nlinha 2" }]), "linha 1 linha 2", "quebras dentro de um bloco viram espaço");
  assert.equal(blocksToMarkdown([{ type: "p", text: "  " }, { type: "h2" }, { type: "ul", items: [] }, { type: "p", text: "ok" }]), "ok");
  assert.equal(blocksToMarkdown([{ type: "p", items: ["um", "dois"] }]), "- um\n- dois");
  assert.equal(blocksToMarkdown([{ type: "zzz", text: "texto" }]), "texto");
});

test("isFlatMarkdown: só artigo longo e sem quebras de linha conta como achatado", () => {
  assert.equal(isFlatMarkdown("palavra ".repeat(300)), true);
  assert.equal(isFlatMarkdown(("palavra ".repeat(40) + "\n\n").repeat(10)), false);
  assert.equal(isFlatMarkdown("texto curto"), false);
});

// ---------------------------------------------------------------- chamada ao Gemini
const apiReply = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const okBody = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] });

async function withFetch<T>(replies: Array<() => unknown>, fn: (calls: () => number) => Promise<T>): Promise<T> {
  const realFetch = g.fetch;
  const realTimeout = g.setTimeout;
  let n = 0;
  g.fetch = async () => (replies[Math.min(n++, replies.length - 1)] as () => unknown)();
  g.setTimeout = (cb: () => void) => { queueMicrotask(cb); return 0; }; // sem esperar de verdade entre as tentativas
  try {
    return await fn(() => n);
  } finally {
    g.fetch = realFetch;
    g.setTimeout = realTimeout;
  }
}
const gem = { apiKey: "k", model: "m" };

test("callGemini: devolve o JSON da resposta", async () => {
  await withFetch([() => apiReply(200, okBody({ a: 1 }))], async () => {
    assert.deepEqual(await callGemini(gem, "oi", {}), { a: 1 });
  });
});

test("callGemini: tenta de novo quando o Gemini está sobrecarregado (503) e acaba funcionando", async () => {
  await withFetch([() => apiReply(503, "overloaded"), () => apiReply(503, "overloaded"), () => apiReply(200, okBody({ ok: true }))], async (calls) => {
    assert.deepEqual(await callGemini(gem, "oi", {}), { ok: true });
    assert.equal(calls(), 3);
  });
});

test("callGemini: desiste depois de 3 tentativas com erro passageiro", async () => {
  await withFetch([() => apiReply(503, "overloaded")], async (calls) => {
    await assert.rejects(() => callGemini(gem, "oi", {}), TransientError);
    assert.equal(calls(), 3);
  });
});

test("callGemini: limite de uso (429) vira QuotaError na hora, sem repetir", async () => {
  await withFetch([() => apiReply(429, "quota")], async (calls) => {
    await assert.rejects(() => callGemini(gem, "oi", {}), QuotaError);
    assert.equal(calls(), 1);
  });
});

test("callGemini: resposta com JSON inválido ou vazia é tratada como falha passageira", async () => {
  await withFetch([() => apiReply(200, { candidates: [{ content: { parts: [{ text: "{quebrado" }] }, finishReason: "MAX_TOKENS" }] })], async () => {
    await assert.rejects(() => callGemini(gem, "oi", {}), TransientError);
  });
  await withFetch([() => apiReply(200, { candidates: [] })], async () => {
    await assert.rejects(() => callGemini(gem, "oi", {}), TransientError);
  });
});

test("callGemini: erro de chave ou de pedido (400/403) sobe direto, sem repetir", async () => {
  await withFetch([() => apiReply(403, "API key not valid")], async (calls) => {
    await assert.rejects(() => callGemini(gem, "oi", {}), (e: Error) => !(e instanceof TransientError) && !(e instanceof QuotaError) && /403/.test(e.message));
    assert.equal(calls(), 1);
  });
});

// ---------------------------------------------------------------- ciclo completo de um nicho (banco e Gemini falsos)
async function inWorld<T>(
  opts: { niche?: Record<string, unknown>; settings?: Record<string, unknown>; gem?: Record<string, string>; seed?: (db: Record<string, any[]>) => void; env?: Record<string, string> },
  fn: (w: { st: any; ctx: any }) => Promise<T>,
): Promise<T> {
  const db = freshDb(opts.settings);
  db.niches.push(niche("Financas", { next_run_at: iso(D(0, 9)), created_at: iso(D(-5, 9)), ...opts.niche }));
  opts.seed?.(db);
  const st: any = { now: D(0, 9), db, idc: 0, lock: 0, calls: 0 };
  const realFetch = g.fetch;
  const realTimeout = g.setTimeout;
  const savedEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(opts.env ?? {})) { savedEnv[k] = process.env[k]; process.env[k] = v; }
  g.__SIM = { st };
  g.fetch = createFakeGemini({ st, behaviors: opts.gem ?? {} });
  g.setTimeout = (cb: () => void) => { queueMicrotask(cb); return 0; };
  try {
    const ctx = { db: createClient(), gemini: gem, niche: db.niches[0], settings: db.site_settings[0], source: "robot" as const };
    return await fn({ st, ctx });
  } finally {
    g.fetch = realFetch;
    g.setTimeout = realTimeout;
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test("ciclo completo: ideias, tópicos, artigo em seções, tags e tópico marcado como usado", async () => {
  await inWorld({}, async ({ st, ctx }) => {
    const r = await runNiche(ctx);
    assert.equal(r.status, "published");
    const post = st.db.posts[0];
    assert.match(post.content, /^## Seção um\n\n/, "começa com um título de seção");
    assert.ok((post.content.match(/\n\n/g) ?? []).length >= 10, "parágrafos separados");
    assert.equal(st.db.ideas.length, 5);
    assert.equal(st.db.subtopics.filter((s: any) => s.status === "used").length, 1);
    assert.equal(st.db.post_tags.length, 2);
    assert.ok(post.word_count >= 1200);
  });
});

test("links internos: o inventado é removido (fica só o texto) e o válido continua", async () => {
  await inWorld({ gem: { "*": "links" } }, async ({ st, ctx }) => {
    await runNiche(ctx); // 1º artigo: nenhum link válido ainda
    await runNiche(ctx); // 2º artigo: pode linkar o 1º
    const [primeiro, segundo] = st.db.posts;
    assert.ok(!primeiro.content.includes("/post/nao-existe") && !segundo.content.includes("/post/nao-existe"));
    assert.ok(segundo.content.includes(`](/post/${primeiro.slug})`));
    assert.ok(segundo.content.includes("veja ruim e "), "o texto do link inventado ficou");
  });
});

test("portão de qualidade: texto curto vai para revisão", async () => {
  await inWorld({ gem: { "*": "curto" } }, async ({ st, ctx }) => {
    assert.equal((await runNiche(ctx)).status, "pending");
    assert.equal(st.db.posts[0].status, "pending");
  });
});

test("tema sensível: sempre revisão, com o aviso configurado no fim (sem repetir)", async () => {
  await inWorld({ niche: { sensitive: true }, settings: { sensitive_disclaimer: "Procure um profissional." } }, async ({ st, ctx }) => {
    assert.equal((await runNiche(ctx)).status, "pending");
    const post = st.db.posts[0];
    assert.ok(post.content.trimEnd().endsWith("> **Aviso:** Procure um profissional."));
    assert.equal(post.content.split("Procure um profissional.").length - 1, 1);
  });
});

test("nicho com 'revisar antes de publicar' nunca publica sozinho", async () => {
  await inWorld({ niche: { require_review: true } }, async ({ ctx }) => {
    assert.equal((await runNiche(ctx)).status, "pending");
  });
});

test("sem repetir: se uma execução anterior salvou o post e caiu, o tópico é só marcado como usado e passa-se ao próximo", async () => {
  await inWorld({}, async ({ st, ctx }) => {
    await runNiche(ctx); // cria ideias, tópicos e o 1º post
    const primeiro = st.db.subtopics.find((s: any) => s.status === "used");
    // simula a queda: o tópico seguinte já tem post, mas continuou "new"
    const seguinte = st.db.subtopics.find((s: any) => s.status === "new");
    st.db.posts.push({ id: "pOrfao", niche_id: "n-Financas", subtopic_id: seguinte.id, title: "x", slug: "x", excerpt: "x", status: "published", content: "x", word_count: 1 });
    await runNiche(ctx);
    assert.equal(st.db.subtopics.find((s: any) => s.id === seguinte.id).status, "used");
    const porTopico: Record<string, number> = {};
    for (const p of st.db.posts) if (p.subtopic_id) porTopico[p.subtopic_id] = (porTopico[p.subtopic_id] ?? 0) + 1;
    assert.ok(Object.values(porTopico).every((n) => n === 1), "nenhum tópico com dois posts");
    assert.ok(primeiro);
  });
});

test("falha ao gravar as tags não derruba o post (ele fica salvo e o tópico, usado)", async () => {
  await inWorld({ env: { SIM_FAIL_TAGS: "1" } }, async ({ st, ctx }) => {
    assert.equal((await runNiche(ctx)).status, "published");
    assert.equal(st.db.posts.length, 1);
    assert.equal(st.db.subtopics.filter((s: any) => s.status === "used").length, 1);
    assert.ok(st.db.pipeline_runs.some((r: any) => r.step === "tags" && r.status === "error"));
  });
});

test("ideias repetidas: o pipeline tenta de novo pedindo temas diferentes", async () => {
  const seed = (db: Record<string, any[]>) => {
    db.ideas = [1, 2, 3, 4, 5].map((k) => ({ id: "i" + k, niche_id: "n-Financas", title: `Financas ideia ${k}`, summary: "", status: "used", created_at: iso(D(-3, 9)) }));
  };
  await inWorld({ gem: { "*": "dup1" }, seed }, async ({ st, ctx }) => {
    assert.equal((await runNiche(ctx)).status, "published");
    assert.ok(st.db.ideas.length > 5);
  });
});

test("reestruturação de artigo achatado: devolve Markdown com quebras; se perder texto, mantém o original (erro)", async () => {
  const flat = "palavra ".repeat(1500).trim();
  await inWorld({}, async () => {
    const md = await reformatFlatContent(gem, flat);
    assert.ok((md.match(/\n/g) ?? []).length >= 4);
    assert.ok(md.split(/\s+/).filter(Boolean).length >= 1500 * 0.85);
  });
  await inWorld({ gem: { "*": "perde" } }, async () => {
    await assert.rejects(() => reformatFlatContent(gem, flat), /perdeu texto/);
  });
});
