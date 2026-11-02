/**
 * Backup dos dados do blog (SEM segredos) em um balde PRIVADO do Supabase Storage chamado "backups".
 * Guarda os 8 mais recentes (um por semana ≈ 2 meses). Não entram: a chave do Gemini (secret_settings),
 * as visitas (page_views) e o histórico do robô (pipeline_runs).
 *
 * Rodar: node --experimental-strip-types scripts/backup.ts   (precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)
 * Restaurar: veja scripts/restore.ts e docs/OPERACAO.md.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

type DB = any;

export const BUCKET = "backups";
export const KEEP = 8;
const PAGE = 1000;
const CHUNK = 200;

/** Tabelas na ordem em que podem ser restauradas (quem é referenciado vem antes). `key` = chave usada para não duplicar linhas. */
export const TABLES: { name: string; key: string; order: string[] }[] = [
  { name: "niches", key: "id", order: ["id"] },
  { name: "tags", key: "id", order: ["id"] },
  { name: "ideas", key: "id", order: ["id"] },
  { name: "subtopics", key: "id", order: ["id"] },
  { name: "posts", key: "id", order: ["id"] },
  { name: "post_tags", key: "post_id,tag_id", order: ["post_id", "tag_id"] },
  { name: "comments", key: "id", order: ["created_at", "id"] }, // respostas só depois do comentário original
  { name: "ratings", key: "id", order: ["id"] },
  { name: "site_settings", key: "id", order: ["id"] },
];

export interface Backup {
  version: 1;
  created_at: string;
  counts: Record<string, number>;
  tables: Record<string, any[]>;
}

/** Lê todas as tabelas (página por página). */
export async function makeBackup(db: DB, now = new Date()): Promise<Backup> {
  const tables: Record<string, any[]> = {};
  for (const t of TABLES) {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = db.from(t.name).select("*");
      for (const col of t.order) q = q.order(col);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(`Falha ao ler ${t.name}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    tables[t.name] = rows;
  }
  return { version: 1, created_at: now.toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), tables };
}

/** Compacta, envia ao balde privado e apaga os mais antigos (guarda os `keep` mais recentes). */
export async function saveBackup(db: DB, backup: Backup, keep = KEEP) {
  const name = `${backup.created_at.replace(/[:.]/g, "-")}.json.gz`;
  const bytes = gzipSync(Buffer.from(JSON.stringify(backup)));
  await db.storage.createBucket(BUCKET, { public: false }); // se já existir, o erro "já existe" é ignorado
  const { error } = await db.storage.from(BUCKET).upload(name, bytes, { contentType: "application/gzip", upsert: false });
  if (error) throw new Error(`Falha ao enviar o backup: ${error.message}`);
  const { data: files } = await db.storage.from(BUCKET).list("");
  const names: string[] = ((files ?? []) as { name: string }[]).map((f) => f.name).filter((n) => n.endsWith(".json.gz")).sort().reverse();
  const old = names.slice(keep);
  if (old.length) await db.storage.from(BUCKET).remove(old);
  return { name, size: bytes.length, removed: old.length };
}

/** Baixa e abre um backup do balde. */
export async function loadBackup(db: DB, name: string): Promise<Backup> {
  const { data, error } = await db.storage.from(BUCKET).download(name);
  if (error || !data) throw new Error(`Não encontrei o backup "${name}": ${error?.message ?? "arquivo ausente"}`);
  return JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as Backup;
}

/** Devolve as linhas do backup ao banco (upsert: recria o que sumiu e corrige o que mudou; não apaga o que existe a mais). */
export async function restoreBackup(db: DB, backup: Backup, o: { dryRun?: boolean } = {}) {
  const done: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = backup.tables?.[t.name] ?? [];
    done[t.name] = rows.length;
    if (o.dryRun) continue;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db.from(t.name).upsert(rows.slice(i, i + CHUNK), { onConflict: t.key });
      if (error) throw new Error(`Falha ao restaurar ${t.name}: ${error.message}`);
    }
  }
  return done;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const backup = await makeBackup(db);
  const saved = await saveBackup(db, backup);
  console.log(`Backup salvo: ${saved.name} (${(saved.size / 1024).toFixed(0)} KB). Linhas por tabela: ${JSON.stringify(backup.counts)}. Antigos apagados: ${saved.removed}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
