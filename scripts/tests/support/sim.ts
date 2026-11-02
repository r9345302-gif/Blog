/**
 * Ajudantes dos testes: monta um "mundo" falso (banco + estado) e roda o robô de verdade (scripts/generate.ts)
 * como um processo separado, com relógio, Gemini e banco falsos (veja support/register.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const REGISTER = join(here, "register.mjs");
const QUARTER = 15 * 60_000;

export const iso = (ms: number) => new Date(ms).toISOString();
/** Dia 0 = 16/10/2026 (UTC). */
export const D = (day: number, h: number, m = 0) => Date.UTC(2026, 9, 16 + day, h, m);

export function niche(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: "n-" + name, name, slug: name.toLowerCase(), description: "", audience: "", tone: "", post_structure: null,
    extra_instructions: "", min_words: 1200, author_name: "Redação", interval_days: 1, publish_hour: 9, default_tags: [],
    require_review: false, sensitive: false, active: true, color: "#000", sort_order: 0, next_run_at: null, paused_reason: null,
    created_at: null, ...extra,
  };
}

/** Banco novo, com todas as tabelas (use `withoutNewTables` para simular um projeto sem os patches 002+). */
export function freshDb(settings: Record<string, unknown> = {}, withoutNewTables = false): Record<string, any[]> {
  const db: Record<string, any[]> = {
    niches: [], ideas: [], subtopics: [], posts: [], tags: [], post_tags: [], pipeline_runs: [], comments: [], ratings: [],
    secret_settings: [{ id: 1, gemini_api_key: "k", gemini_model: null }],
    site_settings: [{ id: 1, language: "pt-BR", region: "BR", post_structure: "1. Introdução", site_name: "Pauta", site_url: "", ...settings }],
    robot_status: [{ id: 1, last_run_at: null, last_result: "", last_publish_at: null, last_error: "", last_error_at: null }],
    site_state: [{ id: 1, content_changed_at: iso(D(0, 8)), deploy_requested_at: iso(D(0, 8)) }],
  };
  if (withoutNewTables) {
    delete db.robot_status;
    delete db.site_state;
  }
  return db;
}

export interface TickResult {
  at: number;
  code: number | null;
  stdout: string;
  stderr: string;
  /** true/false conforme a saída "deploy" do robô; null se o robô não escreveu essa saída */
  deploy: boolean | null;
}

export interface RunOptions {
  until: number;
  from?: number;
  gem?: (t: number) => Record<string, string>;
  env?: Record<string, string>;
  /** true = roda o robô em TODAS as rodadas (padrão: só quando algum nicho está vencido) */
  always?: boolean;
}

export class Sim {
  readonly dir = mkdtempSync(join(tmpdir(), "robot-sim-"));
  readonly file = join(this.dir, "state.json");
  readonly outFile = join(this.dir, "gh-output.txt");
  /** Acontecimentos fora do robô (ex.: um nicho novo, uma edição no admin) */
  events: { at: number; run: (st: any) => void; done?: boolean }[] = [];
  ticks: TickResult[] = [];

  constructor(db: Record<string, any[]>, startAt = D(0, 8, 55)) {
    writeFileSync(this.file, JSON.stringify({ now: startAt, db, idc: 0, lock: 0, calls: 0 }));
  }

  get state(): any {
    return JSON.parse(readFileSync(this.file, "utf8"));
  }

  edit(fn: (st: any) => void) {
    const st = this.state;
    fn(st);
    writeFileSync(this.file, JSON.stringify(st));
  }

  /** Uma execução do robô no instante `at`. */
  tick(at: number, gem: Record<string, string> = {}, env: Record<string, string> = {}): TickResult {
    this.edit((st) => {
      st.now = Math.max(at + 30_000, st.now);
    });
    if (existsSync(this.outFile)) unlinkSync(this.outFile);
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", REGISTER, "scripts/generate.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env, ...env,
        SIM_STATE: this.file, SIM_GEMINI: JSON.stringify(gem), GITHUB_OUTPUT: this.outFile,
        SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", GEMINI_API_KEY: "k", MAX_POSTS_PER_RUN: "2",
      },
    });
    const out = existsSync(this.outFile) ? readFileSync(this.outFile, "utf8") : "";
    const deploy = /deploy=true/.test(out) ? true : /deploy=false/.test(out) ? false : null;
    const result = { at, code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", deploy };
    this.ticks.push(result);
    return result;
  }

  /** Roda o robô a cada 15 minutos até `until`, aplicando os acontecimentos nos horários marcados. */
  run(o: RunOptions) {
    for (let t = o.from ?? D(0, 8, 55); t <= o.until; t += QUARTER) {
      const now = Math.max(t + 30_000, this.state.now);
      for (const e of this.events) {
        if (!e.done && now >= e.at) {
          e.done = true;
          this.edit((st) => e.run(st));
        }
      }
      const due = this.state.db.niches.some((n: any) => n.active && n.next_run_at <= iso(now));
      if (!o.always && !due) continue;
      this.tick(t, o.gem ? o.gem(now) : {}, o.env ?? {});
    }
    return this;
  }

  close() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
