/**
 * Testes do BACKUP e da RESTAURAÇÃO (scripts/backup.ts), com banco falso. Sem internet.
 * Rodar: node --experimental-strip-types --test scripts/tests/*.check.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUCKET, loadBackup, makeBackup, restoreBackup, saveBackup, TABLES } from "../backup.ts";
import { createClient } from "./support/fake-supabase.mjs";

const g = globalThis as any;

function world() {
  const t0 = "2026-10-16T09:00:00.000Z";
  const db: Record<string, any[]> = {
    niches: [{ id: "n1", name: "Cultura", slug: "cultura" }, { id: "n2", name: "Naruto", slug: "naruto" }],
    tags: [{ id: "t1", name: "anime", slug: "anime" }, { id: "t2", name: "manga", slug: "manga" }],
    ideas: [{ id: "i1", niche_id: "n1", title: "Ideia", status: "used" }],
    subtopics: [{ id: "s1", idea_id: "i1", niche_id: "n1", title: "Tópico", status: "used" }],
    posts: [
      { id: "p1", niche_id: "n1", subtopic_id: "s1", title: "Um", slug: "um", status: "published", content: "## Um\n\ntexto" },
      { id: "p2", niche_id: "n2", subtopic_id: null, title: "Dois", slug: "dois", status: "pending", content: "texto 2" },
    ],
    post_tags: [{ post_id: "p1", tag_id: "t1" }, { post_id: "p1", tag_id: "t2" }, { post_id: "p2", tag_id: "t1" }],
    comments: [
      { id: "c2", post_id: "p1", parent_id: "c1", author_name: "Bia", body: "resposta", approved: true, created_at: "2026-10-16T09:10:00.000Z" },
      { id: "c1", post_id: "p1", parent_id: null, author_name: "Ana", body: "oi", approved: true, created_at: t0 },
    ],
    ratings: [{ id: "r1", post_id: "p1", session_id: "sess-12345", relevance: 5, reaction: "adorei" }],
    site_settings: [{ id: 1, site_name: "Pauta", about: "Sobre" }],
    secret_settings: [{ id: 1, gemini_api_key: "SEGREDO-NAO-PODE-VAZAR" }],
    page_views: [{ id: "v1", post_id: "p1" }],
  };
  g.__SIM = { st: { db, idc: 0 } };
  return { db, client: createClient() };
}
const snapshot = (db: Record<string, any[]>) => Object.fromEntries(TABLES.map((t) => [t.name, structuredClone(db[t.name])]));

test("o backup leva os dados do blog e NUNCA os segredos nem as visitas", async () => {
  const { client } = world();
  const backup = await makeBackup(client);
  assert.deepEqual(Object.keys(backup.tables), TABLES.map((t) => t.name));
  assert.equal(backup.counts.posts, 2);
  assert.equal(backup.counts.post_tags, 3);
  assert.ok(!JSON.stringify(backup).includes("SEGREDO-NAO-PODE-VAZAR"));
  assert.ok(!("secret_settings" in backup.tables) && !("page_views" in backup.tables));
  assert.equal(backup.tables.comments?.[0]?.id, "c1", "o comentário original vem antes da resposta");
});

test("o backup lê tabelas grandes página por página (sem cortar em 1000 linhas)", async () => {
  const { db, client } = world();
  db.comments = Array.from({ length: 2300 }, (_, i) => ({ id: `c${i}`, post_id: "p1", parent_id: null, body: "x", created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
  const backup = await makeBackup(client);
  assert.equal(backup.counts.comments, 2300);
});

test("salvar: balde privado, nome com a data e só os mais recentes são mantidos", async () => {
  const { client } = world();
  const nomes: string[] = [];
  for (const dia of [1, 2, 3, 4]) {
    const b = await makeBackup(client, new Date(Date.UTC(2026, 9, dia, 3, 23)));
    nomes.push((await saveBackup(client, b, 2)).name);
  }
  assert.equal(g.__SIM.st.buckets[BUCKET].public, false, "o balde é privado");
  const guardados = Object.keys(g.__SIM.st.storage).map((k) => k.slice(BUCKET.length + 1)).sort();
  assert.deepEqual(guardados, nomes.slice(2).sort(), "ficaram só os 2 mais novos");
  assert.match(nomes[0] ?? "", /^2026-10-01T03-23-00-000Z\.json\.gz$/);
});

test("ida e volta: apagar tudo e restaurar devolve exatamente os mesmos dados", async () => {
  const { db, client } = world();
  const antes = snapshot(db);
  const saved = await saveBackup(client, await makeBackup(client));
  for (const t of TABLES) db[t.name]!.length = 0; // desastre: tudo apagado
  const aberto = await loadBackup(client, saved.name);
  const feito = await restoreBackup(client, aberto);
  assert.equal(feito.posts, 2);
  const normaliza = (rows: any[]) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  for (const t of TABLES) assert.deepEqual(normaliza(db[t.name]!), normaliza(antes[t.name]!), `tabela ${t.name}`);
});

test("restaurar por cima de dados existentes corrige o que mudou e não duplica", async () => {
  const { db, client } = world();
  const backup = await makeBackup(client);
  db.posts![0]!.title = "Título estragado";
  await restoreBackup(client, backup);
  assert.equal(db.posts!.length, 2);
  assert.equal(db.posts![0]!.title, "Um");
  assert.equal(db.post_tags!.length, 3, "a chave composta (post, tag) não duplica");
});

test("conferência (dry-run) não altera nada", async () => {
  const { db, client } = world();
  const backup = await makeBackup(client);
  for (const t of TABLES) db[t.name]!.length = 0;
  const feito = await restoreBackup(client, backup, { dryRun: true });
  assert.equal(feito.posts, 2);
  assert.equal(db.posts!.length, 0);
});

test("restaurar um arquivo que não existe dá um erro claro", async () => {
  const { client } = world();
  await assert.rejects(() => loadBackup(client, "nao-existe.json.gz"), /Não encontrei o backup/);
});
