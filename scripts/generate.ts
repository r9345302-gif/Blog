/**
 * Robô executado pelo GitHub Actions a cada 15 minutos.
 * Rodar: node --experimental-strip-types scripts/generate.ts
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (opcional),
 *      MAX_POSTS_PER_RUN (nichos por rodada, padrão 2), RUN_BUDGET_MINUTES (padrão 10)
 *
 * Como os nichos são atendidos — UM DE CADA VEZ, do mais atrasado para o mais novo:
 *  - cada nicho tem a própria agenda (next_run_at): um nicho novo entra na fila, não toma o lugar dos outros;
 *  - antes de começar, o nicho é "reservado" (next_run_at +45 min): se a execução travar ou for cancelada,
 *    ele volta sozinho mais tarde e os outros não ficam esperando;
 *  - a falha de um nicho nunca impede os demais da rodada;
 *  - falha passageira reagenda com espera crescente; só pausa após várias falhas em 24 h,
 *    e qualquer pausa se desfaz sozinha quando chega a hora marcada (12 h depois).
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
const maxNiches = Number(process.env.MAX_POSTS_PER_RUN) || 2;
const budgetMs = (Number(process.env.RUN_BUDGET_MINUTES) || 10) * 60_000;
const startedAt = Date.now();

const MIN = 60_000;
const LEASE_MIN = 45; // reserva do nicho enquanto ele roda
const QUOTA_RETRY_MIN = 60; // limite de uso do Gemini: tenta de novo daqui a 1 h
const MAX_FAILURES_24H = 5; // falhas (fora limite de uso) em 24 h antes de pausar
const AUTO_PAUSE_HOURS = 12;

const inMinutes = (m: number) => new Date(Date.now() + m * MIN).toISOString();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Falha que não é limite de uso: reagenda com espera crescente e só pausa se repetir várias vezes. */
async function handleFailure(niche: PipelineNiche, msg: string) {
  const since = new Date(Date.now() - 24 * 60 * MIN).toISOString();
  const { count } = await db
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("niche_id", niche.id)
    .eq("step", "run")
    .eq("status", "error")
    .eq("source", "robot")
    .not("message", "ilike", "Gemini: limite de uso%")
    .gte("created_at", since);
  const failures = count ?? 1;
  if (failures >= MAX_FAILURES_24H) {
    const reason = `Pausado automaticamente após ${failures} falhas em 24 h (tenta de novo sozinho em ${AUTO_PAUSE_HOURS} h). Último erro: ${msg}`;
    await db.from("niches").update({ paused_reason: reason.slice(0, 500), next_run_at: inMinutes(AUTO_PAUSE_HOURS * 60) }).eq("id", niche.id);
    console.log(`  ⏸ pausado por ${AUTO_PAUSE_HOURS} h (volta sozinho)`);
  } else {
    const wait = 20 * failures;
    await db.from("niches").update({ next_run_at: inMinutes(wait) }).eq("id", niche.id);
    console.log(`  ↻ nova tentativa em ${wait} min (falha ${failures} de ${MAX_FAILURES_24H})`);
  }
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

    // Nichos pausados cuja hora de voltar já chegou entram de novo na fila.
    await db.from("niches").update({ paused_reason: null }).not("paused_reason", "is", null).lte("next_run_at", new Date().toISOString());

    // Fila: nichos vencidos, do mais atrasado para o mais novo.
    const { data: niches, error } = await db
      .from("niches")
      .select("*")
      .eq("active", true)
      .is("paused_reason", null)
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at")
      .order("created_at")
      .limit(maxNiches);
    if (error) throw error;
    if (!niches?.length) {
      console.log("Nenhum nicho com publicação pendente.");
      return;
    }
    console.log(`Fila desta rodada: ${(niches as PipelineNiche[]).map((n) => n.name).join(" → ")}`);

    let quotaHits = 0;
    for (const niche of niches as PipelineNiche[]) {
      if (Date.now() - startedAt > budgetMs) {
        console.log("Tempo da rodada esgotado; os nichos restantes ficam para a próxima rodada.");
        break;
      }
      // Reserva o nicho: se esta execução travar ou for cancelada, ele volta sozinho e não bloqueia os outros.
      await db.from("niches").update({ next_run_at: inMinutes(LEASE_MIN) }).eq("id", niche.id);
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
          // Limite de uso do Gemini: este nicho tenta de novo mais tarde; o próximo da fila ainda tem a sua chance.
          await db.from("niches").update({ next_run_at: inMinutes(QUOTA_RETRY_MIN) }).eq("id", niche.id);
          if (++quotaHits >= 2) {
            console.log("Limite do Gemini atingido de novo; encerrando a rodada.");
            break;
          }
          console.log("  Limite do Gemini: nicho reagendado; tentando o próximo da fila em 60 s.");
          await sleep(60_000);
          continue;
        }
        await handleFailure(niche, msg);
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
