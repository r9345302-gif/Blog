/**
 * Confere a pasta gerada ANTES de publicar. Se algo estiver errado, o passo falha e o site antigo continua no ar.
 * Uso: node --experimental-strip-types scripts/verify-build.ts <pastaGerada>
 * Variáveis: SITE_BASE, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 * Para desligar temporariamente: crie a variável VERIFY_BUILD=off (Settings → Secrets and variables → Actions → Variables).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const out = process.argv[2] || "dist/client";
const sitePath = (process.env.SITE_BASE || "/").replace(/\/+$/, ""); // "/Blog" ou "" na raiz
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const errors: string[] = [];
const warnings: string[] = [];

function listFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

// 1) A página inicial existe?
const indexPath = join(out, "index.html");
if (!existsSync(indexPath)) errors.push(`"${indexPath}" não existe.`);

// 2) O Supabase estava configurado no build? (sem isso o site sairia com posts de exemplo)
if (!url || !key) {
  errors.push(
    "VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY estão vazias (Settings → Secrets and variables → Actions → Variables). O site sairia com posts de exemplo.",
  );
}

// 3) Em subpasta (/Blog/), todo link/arquivo interno da página inicial precisa começar com o prefixo.
if (existsSync(indexPath) && sitePath) {
  const html = readFileSync(indexPath, "utf8");
  const bad = [...html.matchAll(/\s(?:href|src)=["'](\/(?!\/)[^"']*)["']/g)]
    .map((m) => String(m[1]))
    .filter((p) => p !== sitePath && !p.startsWith(`${sitePath}/`));
  if (bad.length) {
    errors.push(
      `${bad.length} link(s)/arquivo(s) da página inicial não começam com "${sitePath}/" (ex.: ${[...new Set(bad)].slice(0, 5).join(", ")}). ` +
        "A navegação quebraria em subpasta — me envie este erro para ajustar o roteador.",
    );
  }
}

// 4) Todo post publicado no banco tem página gerada?
if (url && key) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.from("posts").select("slug").eq("status", "published");
    if (error) throw new Error(error.message);
    const slugs = (data ?? []).map((r: { slug: string }) => r.slug);
    const files = existsSync(out) ? listFiles(out).map((f) => "/" + relative(out, f).replace(/\\/g, "/")) : [];
    const found = new Set<string>();
    for (const f of files) {
      const m = f.match(/\/post\/([^/]+)\/index\.html$/) ?? f.match(/\/post\/([^/]+)\.html$/);
      if (m) found.add(decodeURIComponent(String(m[1])));
    }
    console.log(`posts publicados no banco: ${slugs.length} | páginas de post geradas: ${found.size}`);
    const missing = slugs.filter((s) => !found.has(s));
    if (missing.length) {
      errors.push(`${missing.length} post(s) publicado(s) sem página gerada: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
      console.log("Exemplos de .html gerados:", files.filter((f) => f.endsWith(".html")).slice(0, 8).join(" | ") || "(nenhum)");
    }
    if (!slugs.length) warnings.push("nenhum post publicado ainda.");
  } catch (e) {
    errors.push(`não foi possível conferir os posts no Supabase: ${(e as Error).message}`);
  }
}

for (const w of warnings) console.warn(`AVISO: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERRO: ${e}`);
  console.error("\nO site NÃO foi publicado; a versão anterior continua no ar. Corrija o que está acima e rode o workflow de novo.");
  process.exit(1);
}
console.log("Verificação do build: OK");
