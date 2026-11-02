/**
 * Testes do ROBÔ (scripts/generate.ts) rodando de verdade, com banco, Gemini e relógio falsos. Sem internet.
 * Rodar: node --experimental-strip-types --test scripts/tests/*.check.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { D, Sim, freshDb, iso, niche } from "./support/sim.ts";

const base = (extra: Record<string, unknown> = {}, settings: Record<string, unknown> = {}, withoutNewTables = false) => {
  const db = freshDb(settings, withoutNewTables);
  db.niches.push(niche("Financas", { next_run_at: iso(D(0, 9)), created_at: iso(D(-5, 9)), ...extra }));
  return db;
};
const appearAt = (name: string, at: number, extra: Record<string, unknown> = {}) => ({
  at,
  run: (st: any) => st.db.niches.push(niche(name, { next_run_at: iso(at), created_at: iso(at), ...extra })),
});
const postsOf = (st: any, name: string) => st.db.posts.filter((p: any) => p.niche_id === "n-" + name);

test("os nichos postam um depois do outro, todo dia, e o nicho novo não toma o lugar do antigo", () => {
  const sim = new Sim(base());
  try {
    sim.events.push(appearAt("Tecnologia", D(0, 14)));
    sim.run({ until: D(2, 12) });
    const st = sim.state;
    assert.ok(postsOf(st, "Financas").length >= 3, "o nicho antigo continua postando");
    assert.ok(postsOf(st, "Tecnologia").length >= 3, "o nicho novo também posta");
    const dia1 = st.db.posts.filter((p: any) => p.created_at.startsWith("2026-10-17"));
    assert.equal(dia1.length, 2, "no dia seguinte os dois saem");
    assert.deepEqual(dia1.map((p: any) => p.niche_id), ["n-Financas", "n-Tecnologia"], "na mesma rodada, um depois do outro");
  } finally {
    sim.close();
  }
});

test("uma queda do Gemini na hora do nicho não o pausa para sempre", () => {
  const sim = new Sim(base());
  try {
    sim.run({ until: D(1, 12), gem: (t) => (t >= D(0, 9) && t < D(0, 11, 30) ? { "*": "err503" } : {}) });
    const st = sim.state;
    assert.equal(st.db.niches[0].paused_reason, null);
    assert.ok(postsOf(st, "Financas").length >= 2, "publicou depois que o Gemini voltou e também no dia seguinte");
  } finally {
    sim.close();
  }
});

test("um nicho que derruba a execução não impede os outros de postar", () => {
  const sim = new Sim(base());
  try {
    sim.events.push(appearAt("Tecnologia", D(0, 14)));
    sim.run({ until: D(2, 12), gem: () => ({ Tecnologia: "kill" }) });
    assert.ok(postsOf(sim.state, "Financas").length >= 3, "o nicho saudável posta todos os dias");
  } finally {
    sim.close();
  }
});

test("limite de uso do Gemini: ninguém é pausado e tudo volta quando a cota volta", () => {
  const sim = new Sim(base());
  try {
    sim.events.push(appearAt("Tecnologia", D(0, 9)));
    sim.run({ until: D(1, 12), gem: (t) => (t < D(0, 13) ? { "*": "quota" } : {}) });
    const st = sim.state;
    assert.equal(st.db.niches.filter((n: any) => n.paused_reason).length, 0);
    assert.ok(postsOf(st, "Financas").length >= 2 && postsOf(st, "Tecnologia").length >= 2);
  } finally {
    sim.close();
  }
});

test("texto abaixo do mínimo vai para revisão, com o motivo no histórico", () => {
  const sim = new Sim(base());
  try {
    sim.run({ until: D(0, 12), gem: () => ({ "*": "curto" }) });
    const st = sim.state;
    assert.equal(st.db.posts.length, 1);
    assert.equal(st.db.posts[0].status, "pending");
    assert.ok(st.db.pipeline_runs.some((r: any) => r.step === "publish" && /texto curto/.test(r.message)));
  } finally {
    sim.close();
  }
});

test("tema sensível vai para revisão e ganha o aviso no fim do texto", () => {
  const sim = new Sim(base({ sensitive: true }));
  try {
    sim.run({ until: D(0, 12) });
    const post = sim.state.db.posts[0];
    assert.equal(post.status, "pending");
    assert.match(post.content, /> \*\*Aviso:\*\*/);
  } finally {
    sim.close();
  }
});

test("artigo antigo sem quebras de linha é reestruturado sozinho, sem perder texto", () => {
  const db = base();
  const flat = "palavra ".repeat(1500).trim();
  db.posts.push({ id: "pOld", niche_id: "n-Financas", subtopic_id: null, title: "Antigo", slug: "antigo", excerpt: "x", status: "published", word_count: 1500, content: flat, published_at: iso(D(-1, 9)), created_at: iso(D(-1, 9)) });
  const sim = new Sim(db);
  try {
    sim.run({ until: D(0, 12) });
    const old = sim.state.db.posts.find((p: any) => p.id === "pOld");
    assert.ok((old.content.match(/\n/g) ?? []).length >= 4, "ganhou quebras de linha");
    assert.ok(old.content.split(/\s+/).filter(Boolean).length >= 1500 * 0.85, "não perdeu texto");
  } finally {
    sim.close();
  }
});

test("capas com IA: gera, guarda no Storage e grava no artigo; sem plano pago, os posts seguem normais", () => {
  const ok = new Sim(base({}, { cover_images: true }));
  try {
    ok.run({ until: D(0, 12) });
    const st = ok.state;
    assert.ok(st.db.posts[0].cover_url.includes("/post-images/covers/"));
    assert.ok(st.db.posts[0].cover_alt.length > 0);
    assert.ok(Object.keys(st.storage ?? {}).some((k) => k.startsWith("post-images/covers/")));
  } finally {
    ok.close();
  }
  const semPlano = new Sim(base({}, { cover_images: true }));
  try {
    semPlano.run({ until: D(0, 12), gem: () => ({ "*": "img429" }) });
    const st = semPlano.state;
    assert.equal(st.db.posts.length, 1);
    assert.equal(st.db.posts[0].status, "published");
    assert.equal(st.db.posts[0].cover_url, "");
    assert.ok(st.db.pipeline_runs.some((r: any) => r.step === "cover" && r.status === "error" && /plano pago/.test(r.message)));
  } finally {
    semPlano.close();
  }
});

test("capas desligadas: nenhuma chamada de imagem", () => {
  const sim = new Sim(base({}, { cover_images: false }));
  try {
    sim.run({ until: D(0, 12) });
    assert.equal(sim.state.imageCalls ?? 0, 0);
  } finally {
    sim.close();
  }
});

test("o site é recriado sozinho quando o conteúdo muda, mesmo sem nicho vencido, e não em dobro", () => {
  const sim = new Sim(base());
  try {
    sim.run({ until: D(0, 10) }); // o robô publica e já pede a recriação
    assert.equal(sim.ticks.at(-1)?.deploy, true);
    const quieto = sim.tick(D(0, 10, 30));
    assert.equal(quieto.deploy, false, "sem mudanças, sem nova recriação");
    sim.edit((st) => { st.db.site_state[0].content_changed_at = iso(D(0, 11)); }); // alguém aprovou um post no admin
    assert.equal(sim.tick(D(0, 11, 15)).deploy, true);
    assert.equal(sim.tick(D(0, 11, 30)).deploy, false);
  } finally {
    sim.close();
  }
});

test("o robô também funciona antes dos patches de saúde e recriação (sem as tabelas novas)", () => {
  const sim = new Sim(base({}, {}, true));
  try {
    sim.run({ until: D(0, 12) });
    assert.ok(sim.ticks.every((t) => t.code === 0), sim.ticks.map((t) => t.stderr).join("\n"));
    assert.equal(sim.state.db.posts.length, 1);
    assert.equal(sim.ticks.at(-1)?.deploy, true, "sem a tabela, volta ao comportamento antigo (publicou, recria)");
  } finally {
    sim.close();
  }
});

test("a execução que morre depois de salvar o post não gera post repetido", () => {
  const sim = new Sim(base());
  try {
    sim.run({ until: D(1, 12), env: { SIM_KILL_BEFORE_USED: "1" } });
    const porTopico: Record<string, number> = {};
    for (const p of sim.state.db.posts) if (p.subtopic_id) porTopico[p.subtopic_id] = (porTopico[p.subtopic_id] ?? 0) + 1;
    assert.ok(Object.values(porTopico).every((n) => n === 1));
    assert.ok(sim.state.db.posts.length >= 1);
  } finally {
    sim.close();
  }
});
