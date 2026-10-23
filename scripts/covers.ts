/**
 * Capas dos artigos geradas pelo Gemini (modelo de imagem). Só roda no robô (Node) — nunca no navegador.
 *
 * Fluxo por artigo: (1) o Gemini de texto escreve o prompt da imagem; (2) o Gemini de imagem desenha;
 * (3) a imagem é reduzida (JPEG 1280 px para a capa, WebP 480 px para as listas) com "sharp";
 * (4) vai para o Storage público "post-images"; (5) os endereços são gravados no artigo.
 *
 * É opcional e à prova de falhas: sem a opção ligada, sem plano pago, sem cota ou com recusa do modelo,
 * o artigo continua com a capa de cores e o erro fica no histórico (aba Saúde do robô).
 * Custo: a API de imagens do Gemini é paga (cerca de US$ 0,04 por imagem).
 */
import { callGemini, QuotaError } from "../src/lib/pipeline-core.ts";

type DB = any;

const BUCKET = "post-images";
const BACKFILL_DAYS = 60; // só artigos recentes ganham capa retroativa
const MIN = 60_000;

export interface CoverOptions {
  db: DB;
  apiKey: string;
  textModel: string;
  imageModel: string;
  settings: { language?: string; cover_images?: boolean; cover_style?: string } | null;
  maxPerRun: number;
  maxPerDay: number;
  hasTime: () => boolean;
}

interface Img {
  data: Buffer;
  type: string;
  ext: string;
}

/** Uma chamada ao modelo de imagem do Gemini; devolve os bytes da primeira imagem da resposta. */
async function generateImage(apiKey: string, model: string, prompt: string, withAspect = true, attempt = 1): Promise<{ data: Buffer; mime: string }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(withAspect ? { imageConfig: { aspectRatio: "16:9" } } : {}) },
  };
  let res: Response;
  let text: string;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    text = await res.text();
  } catch (e) {
    if (attempt < 2) return generateImage(apiKey, model, prompt, withAspect, attempt + 1);
    throw new Error(`Falha de rede ou tempo esgotado ao gerar a imagem: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 429) {
    const hint = /limit"?\s*:\s*0|free.?tier/i.test(text) ? " A API de imagens do Gemini exige plano pago (faturamento ativado no projeto da chave)." : "";
    throw new QuotaError(`Gemini: limite de uso atingido (429) na geração de imagem.${hint} ${text.slice(0, 200)}`);
  }
  if (res.status === 400 && withAspect) return generateImage(apiKey, model, prompt, false, attempt); // modelo sem imageConfig
  if (res.status >= 500 && attempt < 2) return generateImage(apiKey, model, prompt, withAspect, attempt + 1);
  if (!res.ok) throw new Error(`Gemini (imagem) respondeu ${res.status}: ${text.slice(0, 300)}`);
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("O Gemini devolveu uma resposta ilegível ao gerar a imagem.");
  }
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const part = parts.find((p) => p?.inlineData?.data);
  if (!part) {
    const why = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? "sem motivo informado";
    throw new Error(`O Gemini não devolveu imagem (${why}).`);
  }
  return { data: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType || "image/png" };
}

/** Reduz a imagem: capa em JPEG 1280 px e miniatura em WebP 480 px. Sem o "sharp", usa a imagem original. */
async function optimize(src: Buffer, mime: string): Promise<{ full: Img; thumb: Img | null }> {
  try {
    const sharp = (await import("sharp")).default;
    const full = await sharp(src).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
    const thumb = await sharp(src).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    return { full: { data: full, type: "image/jpeg", ext: "jpg" }, thumb: { data: thumb, type: "image/webp", ext: "webp" } };
  } catch (e) {
    console.warn(`  (sharp indisponível; enviando a imagem original: ${e instanceof Error ? e.message : e})`);
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    return { full: { data: src, type: mime, ext }, thumb: null };
  }
}

async function upload(db: DB, path: string, img: Img): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(path, img.data, { contentType: img.type, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Falha ao enviar a imagem para o Storage: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;
}

/** Gera a capa de até `maxPerRun` artigos sem imagem (os mais novos primeiro). Devolve quantas foram geradas. */
export async function makeCovers(o: CoverOptions): Promise<number> {
  if (!o.settings?.cover_images) return 0;
  const since24h = new Date(Date.now() - 24 * 60 * MIN).toISOString();

  // Teto diário (proteção contra gasto inesperado)
  const { count: doneToday } = await o.db
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("step", "cover")
    .eq("status", "ok")
    .gte("created_at", since24h);
  let budget = Math.min(o.maxPerRun, o.maxPerDay - (doneToday ?? 0));
  if (budget <= 0) return 0;

  const recent = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * MIN).toISOString();
  const { data: posts } = await o.db
    .from("posts")
    .select("id,niche_id,title,slug,excerpt,niche:niches(name)")
    .in("status", ["published", "pending"])
    .eq("cover_url", "")
    .gte("created_at", recent)
    .order("created_at", { ascending: false })
    .limit(budget + 6);

  let made = 0;
  for (const p of posts ?? []) {
    if (budget <= 0 || !o.hasTime()) break;
    // Falhou nas últimas 24 h? Não insiste (evita gastar cota e dinheiro em loop).
    const { count: failed } = await o.db
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("step", "cover")
      .eq("status", "error")
      .like("message", `post ${p.id}:%`)
      .gte("created_at", since24h);
    if ((failed ?? 0) > 0) continue;
    try {
      const style = o.settings.cover_style?.trim() || "ilustração digital editorial, composição limpa, cores vibrantes, sem texto";
      const nicheName = Array.isArray(p.niche) ? p.niche[0]?.name : p.niche?.name;
      const meta = await callGemini<{ prompt: string; alt: string }>(
        { apiKey: o.apiKey, model: o.textModel },
        `Você cria prompts para um gerador de imagens que ilustra artigos de blog.
Artigo: "${p.title}"
Resumo: ${p.excerpt}
Assunto do blog: ${nicheName ?? "geral"}
Estilo visual do site: ${style}

Escreva:
- "prompt": em INGLÊS, de 40 a 80 palavras, descrevendo UMA cena de capa horizontal (16:9) que represente o tema do artigo. Regras obrigatórias: sem texto, letras, números, legendas, logotipos nem marcas d'água; sem pessoas reais, celebridades ou rostos de pessoas conhecidas; sem personagens, marcas ou franquias existentes (se o tema for anime, jogo, filme ou série, crie cenas e personagens ORIGINAIS inspirados no gênero, nunca os personagens da obra); sem violência explícita. Termine citando o estilo visual.
- "alt": texto alternativo em ${o.settings.language || "pt-BR"}, até 120 caracteres, descrevendo a imagem.`,
        { type: "object", properties: { prompt: { type: "string" }, alt: { type: "string" } }, required: ["prompt", "alt"] },
      );
      const img = await generateImage(o.apiKey, o.imageModel, `${meta.prompt}\n\nHorizontal 16:9 composition. No text, no letters, no logos, no watermark.`);
      const { full, thumb } = await optimize(img.data, img.mime);
      const coverUrl = await upload(o.db, `covers/${p.slug}.${full.ext}`, full);
      const thumbUrl = thumb ? await upload(o.db, `thumbs/${p.slug}.${thumb.ext}`, thumb) : "";
      await o.db.from("posts").update({ cover_url: coverUrl, cover_thumb_url: thumbUrl, cover_alt: String(meta.alt ?? "").slice(0, 200) }).eq("id", p.id);
      await o.db.from("pipeline_runs").insert({ niche_id: p.niche_id, step: "cover", status: "ok", message: `post ${p.id}: ${p.slug}`, source: "robot" });
      console.log(`  🖼 capa gerada: ${p.title}`);
      made++;
      budget--;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  não foi possível gerar a capa de "${p.title}": ${msg}`);
      await o.db.from("pipeline_runs").insert({ niche_id: p.niche_id, step: "cover", status: "error", message: `post ${p.id}: ${msg}`.slice(0, 2000), source: "robot" });
      if (e instanceof QuotaError) break; // sem cota/plano: não tenta os demais agora
    }
  }
  return made;
}
