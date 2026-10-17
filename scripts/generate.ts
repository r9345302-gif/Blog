/**
 * Robô executado pelo GitHub Actions a cada 15 minutos.
 * Rodar: node --experimental-strip-types scripts/generate.ts
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (opcional),
 *      MAX_POSTS_PER_RUN (nichos por rodada, padrão 2), RUN_BUDGET_MINUTES (padrão 10),
 *      ALERT_WEBHOOK_URL (opcional: aviso no Discord/Slack/Telegram quando um nicho é pausado)
 *
 * Como os nichos são atendidos — UM DE CADA VEZ, do mais atrasado para o mais novo:
 *  - cada nicho tem a própria agenda (next_run_at): um nicho novo entra na fila, não toma o lugar dos outros;
 *  - antes de começar, o nicho é "reservado" (next_run_at +45 min): se a execução travar ou for cancelada,
 *    ele volta sozinho mais tarde e os outros não ficam esperando;
 *  - a falha de um nicho nunca impede os demais da rodada;
 *  - falha passageira reagenda com espera crescente; só pausa após várias falhas em 24 h,
 *    e qualquer pausa se desfaz sozinha quando chega a hora marcada (12 h depois).
 *
 * Também: registra o "batimento" do robô (aba Saúde do robô) e pede a recriação do site quando o conteúdo
 * público mudou (post aprovado, configuração editada...), sem esperar o deploy diário.
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
const alertUrl = process.env.ALERT_WEBHOOK_URL;
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

/** Aviso opcional (Discord/Slack/Telegram). Sem o secret ALERT_WEBHOOK_URL, aparece só no log. */
async function alert(msg: string) {
  console.log(`🔔 ${msg}`);
  if (!alertUrl) return;
  try {
    await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg, text: msg }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn("Não foi possível enviar o alerta:", e instanceof Error ? e.message : e);
  }
}

let healthWarned = false;
/** Painel de saúde (tabela robot_status). Se o patch SQL ainda não foi aplicado, avisa uma vez e segue. */
async function beat(fields: Record<string, unknown>) {
  try {
    const { error } = await db.from("robot_status").update(fields).eq("id", 1);
    if (error && !healthWarned) {
      healthWarned = true;
      console.warn(`(painel de saúde indisponível: ${error.message})`);
    }
  } catch (e) {
    if (!healthWarned) {
      healthWarned = true;
      console.warn("(painel de saúde indisponível)", e instanceof Error ? e.message : e);
    }
  }
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
    await alert(`Nicho "${niche.name}" pausado por ${AUTO_PAUSE_HOURS} h após ${failures} falhas em 24 h. Último erro: ${msg.slice(0, 200)}`);
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
  let pending = 0;
  let failed = 0;
  let attempted = 0;
  let lastError = "";
  let summary = "";
  try {
    await beat({ last_run_at: new Date().toISOString() });
    const { data: secret } = await db.from("secret_settings").select("*").eq("id", 1).single();
    const apiKey = process.env.GEMINI_API_KEY || secret?.gemini_api_key;
    if (!apiKey) {
      console.log("Nenhuma chave Gemini cadastrada. Cadastre em Admin → Configurações gerais.");
      summary = "Sem chave do Gemini cadastrada.";
      return;
    }
    const { data: settings } = await db.from("site_settings").select("*").eq("id", 1).single();

    // Nichos pausados cuja hora de voltar já chegou entram de novo na fila.
    await db.from("niches").update({ paused_reason: null }).not("paused_reason", "is", null).lte("next_run_at", new Date().toISOString());

    // Resumo no log: o que cada nicho está esperando (deixa claro por que um nicho não entrou na fila).
    const { data: overview } = await db.from("niches").select("name,active,paused_reason,next_run_at").order("created_at");
    console.log("Nichos:");
    for (const n of overview ?? []) {
      const when = new Date(n.next_run_at);
      const state = !n.active
        ? "desativado"
        : n.paused_reason
          ? `pausado — ${String(n.paused_reason).slice(0, 80)}`
          : when.getTime() <= Date.now()
            ? "vencido (entra na fila)"
            : `aguardando a hora — próxima publicação em ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;
      console.log(`  • ${n.name}: ${state}`);
    }

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
      summary = "Nenhum nicho vencido.";
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
      attempted++;
      try {
        console.log(`▶ ${niche.name}`);
        const r = await runNiche(ctx);
        if (r.status === "published") published++;
        else pending++;
        await db.from("niches").update({ next_run_at: nextRun(niche) }).eq("id", niche.id);
        console.log(`  ✓ ${r.status}: ${r.slug}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed++;
        lastError = `${niche.name}: ${msg}`;
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
    summary = `${attempted} nicho(s) na fila: ${published} publicado(s), ${pending} em revisão, ${failed} com falha.`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    summary = `Erro: ${lastError}`.slice(0, 300);
    throw e;
  } finally {
    // O conteúdo público mudou desde o último pedido de recriação? (post aprovado, configuração editada, etc.)
    let deploy = published > 0;
    try {
      const { data: st, error: stErr } = await db.from("site_state").select("content_changed_at,deploy_requested_at").eq("id", 1).maybeSingle();
      if (!stErr && st && new Date(st.content_changed_at).getTime() > new Date(st.deploy_requested_at).getTime()) {
        deploy = true;
        await db.from("site_state").update({ deploy_requested_at: st.content_changed_at }).eq("id", 1);
        console.log("Há mudanças no conteúdo do site: pedindo a recriação.");
      }
    } catch (e) {
      console.warn("Não foi possível conferir se o site precisa ser recriado:", e instanceof Error ? e.message : e);
    }
    const now = new Date().toISOString();
    await beat({
      last_result: summary || "Execução interrompida antes do fim.",
      ...(published ? { last_publish_at: now } : {}),
      ...(lastError ? { last_error: lastError.slice(0, 500), last_error_at: now } : {}),
    });
    await db.rpc("release_pipeline_lock");
    output("published", published > 0 ? "true" : "false");
    output("deploy", deploy ? "true" : "false");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
