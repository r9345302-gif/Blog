import { supabase } from "@/lib/supabase";
import type { Ctx, PipelineNiche } from "@/lib/pipeline-core";

/** Builds a pipeline context for manual runs from the admin panel (uses the admin's session). */
export async function buildCtx(niche: PipelineNiche): Promise<Ctx> {
  const db = supabase!;
  const [{ data: secret }, { data: settings }] = await Promise.all([
    db.from("secret_settings").select("*").eq("id", 1).single(),
    db.from("site_settings").select("*").eq("id", 1).single(),
  ]);
  if (!secret?.gemini_api_key) throw new Error("Cadastre a chave do Gemini em Configurações gerais.");
  return { db, gemini: { apiKey: secret.gemini_api_key, model: secret.gemini_model || "gemini-2.5-flash" }, niche, settings, source: "admin" };
}
