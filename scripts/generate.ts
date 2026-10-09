/**
 * Robot executed by GitHub Actions every 15 minutes.
 * Run: node --experimental-strip-types scripts/generate.ts
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional GEMINI_API_KEY, MAX_POSTS_PER_RUN
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "node:fs";
import { nextRun, QuotaError, runNiche, type PipelineNiche } from "../src/lib/pipeline-core.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const maxPosts = Number(process.env.MAX_POSTS_PER_RUN ?? 2);

function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const { data: locked, error: lockErr } = await db.rpc("acquire_pipeline_lock", { _minutes: 14 });
  if (lockErr) throw lockErr;
  if (!locked) {
    console.log("Outra execução está em andamento. Saindo.");
    return;
  }
  let published = 0;
  try {
    const { data: secret } = await db.from("secret_settings").select("*").eq("id", 1).single();
    const apiKey = process.env.GEMINI_API_KEY || secret?.gemini_api_key;
    if (!apiKey) {
      console.log("Nenhuma chave Gemini cadastrada. Cadastre em Admin → Configurações gerais.");
      return;
    }
    const { data: settings } = await db.from("site_settings").select("*").eq("id", 1).single();
    const { data: niches, error } = await db
      .from("niches")
      .select("*")
      .eq("active", true)
      .is("paused_reason", null)
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at")
      .limit(maxPosts);
    if (error) throw error;
    if (!niches?.length) {
      console.log("Nenhum nicho com publicação pendente.");
      return;
    }
    for (const niche of niches as PipelineNiche[]) {
      const ctx = { db, gemini: { apiKey, model: secret?.gemini_model || "gemini-2.5-flash" }, niche, settings, source: "robot" as const };
      try {
        console.log(`▶ ${niche.name}`);
        const r = await runNiche(ctx);
        if (r.status === "published") published++;
        await db.from("niches").update({ next_run_at: nextRun(niche) }).eq("id", niche.id);
        console.log(`  ✓ ${r.status}: ${r.slug}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ✗ ${msg}`);
        await db.from("pipeline_runs").insert({ niche_id: niche.id, step: "run", status: "error", message: msg.slice(0, 2000), source: "robot" });
        if (e instanceof QuotaError) {
          // Quota: try again next scheduled window instead of hammering the API.
          await db.from("niches").update({ next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).eq("id", niche.id);
          break;
        }
        // Other failures pause the niche so the owner can see and fix the cause.
        await db.from("niches").update({ paused_reason: msg.slice(0, 500) }).eq("id", niche.id);
      }
    }
  } finally {
    await db.rpc("release_pipeline_lock");
    output("published", published > 0 ? "true" : "false");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
