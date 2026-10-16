/**
 * AI blog pipeline shared by the admin panel (browser) and the GitHub Actions robot (Node).
 * Must stay import-free so `node --experimental-strip-types` can run it directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export interface PipelineNiche {
  id: string;
  name: string;
  description: string;
  audience: string;
  tone: string;
  post_structure: string | null;
  extra_instructions: string;
  min_words: number;
  author_name: string;
  interval_days: number;
  publish_hour: number;
  default_tags: string[];
  require_review: boolean;
}

export interface PipelineSettings {
  language: string;
  region: string;
  post_structure: string;
  site_name: string;
}

export interface Gemini {
  apiKey: string;
  model: string;
}

export interface Ctx {
  db: DB;
  gemini: Gemini;
  niche: PipelineNiche;
  settings: PipelineSettings;
  source: "robot" | "admin";
}

export class QuotaError extends Error {}
/** Falha passageira (Gemini sobrecarregado, internet, tempo esgotado, resposta cortada): vale tentar de novo. */
export class TransientError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Uma chamada ao Gemini. Falhas passageiras são repetidas até 3 vezes (com espera);
 * limite de uso (429) sobe como QuotaError; qualquer outro erro sobe direto.
 */
export async function callGemini<T>(g: Gemini, prompt: string, schema: object): Promise<T> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(g.model)}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.9 },
  });
  for (let attempt = 1; ; attempt++) {
    try {
      return await callGeminiOnce<T>(g, endpoint, body);
    } catch (e) {
      if (!(e instanceof TransientError) || attempt >= 3) throw e;
      await sleep(attempt * 8000);
    }
  }
}

async function callGeminiOnce<T>(g: Gemini, endpoint: string, body: string): Promise<T> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": g.apiKey },
      body,
      signal: AbortSignal.timeout(180_000),
    });
    text = await res.text();
  } catch (e) {
    throw new TransientError(`Falha de rede ou tempo esgotado ao chamar o Gemini: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 429) throw new QuotaError(`Gemini: limite de uso atingido (429). ${text.slice(0, 300)}`);
  if (res.status >= 500) throw new TransientError(`Gemini respondeu ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${text.slice(0, 500)}`);
  let out: string | undefined;
  let finish: string | undefined;
  try {
    const json = JSON.parse(text);
    finish = json?.candidates?.[0]?.finishReason;
    out = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  } catch {
    throw new TransientError("O Gemini devolveu uma resposta ilegível.");
  }
  if (!out) throw new TransientError(`Gemini não retornou conteúdo (${finish ?? "sem motivo"}).`);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new TransientError(`O Gemini devolveu um JSON inválido (${finish ?? "sem motivo"}); a resposta pode ter sido cortada.`);
  }
}

function context(c: Ctx) {
  const n = c.niche;
  return `Site: ${c.settings.site_name}
Idioma de escrita: ${c.settings.language} | Região/público: ${c.settings.region}
Nicho: ${n.name}
Descrição do nicho: ${n.description || "-"}
Público-alvo: ${n.audience || "-"}
Tom de voz: ${n.tone || "-"}
Instruções extras: ${n.extra_instructions || "-"}`;
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function log(c: Ctx, step: string, status: "ok" | "error" | "skipped", message: string) {
  await c.db.from("pipeline_runs").insert({ niche_id: c.niche.id, step, status, message: message.slice(0, 2000), source: c.source });
}

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Step 1 — 5 new ideas, never repeating anything already used in this niche. */
export async function brainstorm(c: Ctx) {
  const ideas = must<{ title: string }[]>(await c.db.from("ideas").select("title").eq("niche_id", c.niche.id).order("created_at", { ascending: false }).limit(400));
  const posts = must<{ title: string }[]>(await c.db.from("posts").select("title").eq("niche_id", c.niche.id).limit(400));
  const used = [...ideas, ...posts].map((x) => `- ${x.title}`).join("\n") || "(nenhuma ainda)";
  const prompt = `${context(c)}

Tarefa: gere exatamente 5 ideias NOVAS de temas para artigos de blog neste nicho.
Regras:
- Cada ideia deve ser específica (nada genérico como "Dicas de ${c.niche.name}"), com um ângulo claro e útil, com potencial de busca no Google.
- Não repita nem parafraseie nenhuma ideia da lista abaixo. Explore subtemas diferentes entre si.
- Escreva no idioma ${c.settings.language}.

Ideias e artigos já usados:
${used}`;
  const out = await callGemini<{ ideas: { title: string; summary: string }[] }>(c.gemini, prompt, {
    type: "object",
    properties: { ideas: { type: "array", items: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" } }, required: ["title", "summary"] } } },
    required: ["ideas"],
  });
  const existing = new Set([...ideas, ...posts].map((x) => x.title.toLowerCase().trim()));
  const rows = out.ideas
    .filter((i) => i.title && !existing.has(i.title.toLowerCase().trim()))
    .slice(0, 5)
    .map((i) => ({ niche_id: c.niche.id, title: i.title.trim(), summary: i.summary?.trim() ?? "" }));
  const inserted = must<{ id: string; title: string }[]>(await c.db.from("ideas").insert(rows).select("id,title"));
  await log(c, "brainstorm", "ok", `${inserted.length} ideias: ${inserted.map((i) => i.title).join(" | ")}`);
  return inserted;
}

/** Step 2 — break one idea into 5 detailed topics. */
export async function expandIdea(c: Ctx, idea: { id: string; title: string; summary?: string }) {
  const subs = must<{ title: string }[]>(await c.db.from("subtopics").select("title").eq("niche_id", c.niche.id).limit(500));
  const prompt = `${context(c)}

Ideia principal: "${idea.title}"
${idea.summary ? `Resumo: ${idea.summary}` : ""}

Tarefa: destrinche esta ideia em exatamente 5 tópicos de artigo, cada um específico o bastante para virar um post completo e independente.
Para cada tópico, indique o ângulo (o que torna o artigo único e qual dúvida do leitor ele resolve).
Não repita estes tópicos já existentes:
${subs.map((s) => `- ${s.title}`).join("\n") || "(nenhum)"}
Escreva em ${c.settings.language}.`;
  const out = await callGemini<{ topics: { title: string; angle: string }[] }>(c.gemini, prompt, {
    type: "object",
    properties: { topics: { type: "array", items: { type: "object", properties: { title: { type: "string" }, angle: { type: "string" } }, required: ["title", "angle"] } } },
    required: ["topics"],
  });
  const rows = out.topics.slice(0, 5).map((t) => ({ idea_id: idea.id, niche_id: c.niche.id, title: t.title.trim(), angle: t.angle?.trim() ?? "" }));
  const inserted = must<{ id: string; title: string; angle: string }[]>(await c.db.from("subtopics").insert(rows).select("id,title,angle"));
  await c.db.from("ideas").update({ status: "expanded" }).eq("id", idea.id);
  await log(c, "expand", "ok", `"${idea.title}" → ${inserted.map((t) => t.title).join(" | ")}`);
  return inserted;
}

interface Draft {
  title: string;
  excerpt: string;
  content: string;
}

/** Steps 3 + 5 + 6 — write the article, optimise it for search and save/publish it. */
export async function writeAndPublish(c: Ctx, sub: { id: string; title: string; angle: string }) {
  const structure = c.niche.post_structure?.trim() || c.settings.post_structure;
  const min = c.niche.min_words;
  const writePrompt = `${context(c)}

Escreva um artigo de blog completo e original em ${c.settings.language}.
Tópico: "${sub.title}"
Ângulo: ${sub.angle}
Autor (assinatura): ${c.niche.author_name}

Estrutura obrigatória:
${structure}

Regras:
- No mínimo ${min} palavras no campo "content" (conte com cuidado; é melhor passar do que ficar abaixo).
- "content" em Markdown: use ## para seções e ### para subseções; NÃO inclua o título (H1) no content.
- Parágrafos curtos, exemplos concretos, dados apenas quando forem amplamente conhecidos (não invente estatísticas nem fontes).
- "excerpt": 1 a 2 frases instigantes (até 200 caracteres).`;
  const draftSchema = {
    type: "object",
    properties: { title: { type: "string" }, excerpt: { type: "string" }, content: { type: "string" } },
    required: ["title", "excerpt", "content"],
  };
  let draft = await callGemini<Draft>(c.gemini, writePrompt, draftSchema);
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  if (words(draft.content) < min * 0.9) {
    draft = await callGemini<Draft>(
      c.gemini,
      `${writePrompt}\n\nO rascunho abaixo tem só ${words(draft.content)} palavras. Reescreva-o expandindo as seções com mais profundidade até passar de ${min} palavras:\n\n${draft.content}`,
      draftSchema,
    );
  }
  await log(c, "write", "ok", `"${draft.title}" — ${words(draft.content)} palavras`);

  // Step 5 — SEO
  const recent = must<{ title: string; slug: string }[]>(
    await c.db.from("posts").select("title,slug").eq("status", "published").order("published_at", { ascending: false }).limit(40),
  );
  const seoPrompt = `Você é especialista em SEO para blogs (${c.settings.language}, região ${c.settings.region}).
Otimize o artigo abaixo sem reduzir o tamanho nem mudar o sentido:
- "title": título com a palavra-chave principal no início, até 65 caracteres, atraente.
- "meta_description": 140 a 160 caracteres, com a palavra-chave e um convite ao clique.
- "slug": curto, minúsculo, com hífens, sem acentos.
- "tags": 3 a 6 tags curtas (1 a 3 palavras cada).
- "content": o mesmo Markdown, com subtítulos (##) contendo variações da palavra-chave, e até 3 links internos naturais no formato [texto](/post/slug) usando SOMENTE os artigos da lista abaixo, quando fizer sentido.
Artigos existentes:
${recent.map((r) => `- ${r.title} → /post/${r.slug}`).join("\n") || "(nenhum)"}

TÍTULO: ${draft.title}
CONTEÚDO:
${draft.content}`;
  const seo = await callGemini<{ title: string; meta_description: string; slug: string; tags: string[]; content: string }>(c.gemini, seoPrompt, {
    type: "object",
    properties: {
      title: { type: "string" },
      meta_description: { type: "string" },
      slug: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      content: { type: "string" },
    },
    required: ["title", "meta_description", "slug", "tags", "content"],
  });
  const content = words(seo.content) >= words(draft.content) * 0.85 ? seo.content : draft.content;
  await log(c, "seo", "ok", `slug: ${seo.slug} | tags: ${seo.tags.join(", ")}`);

  // Step 6 — save / publish
  let slug = slugify(seo.slug || seo.title) || slugify(draft.title);
  const clash = must<{ slug: string }[]>(await c.db.from("posts").select("slug").like("slug", `${slug}%`));
  if (clash.some((x) => x.slug === slug)) slug = `${slug}-${clash.length + 1}`;
  const status = c.niche.require_review ? "pending" : "published";
  const post = must<{ id: string }>(
    await c.db
      .from("posts")
      .insert({
        niche_id: c.niche.id,
        subtopic_id: sub.id,
        title: seo.title || draft.title,
        slug,
        excerpt: draft.excerpt,
        content,
        meta_description: seo.meta_description,
        author_name: c.niche.author_name,
        status,
        word_count: words(content),
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .select("id")
      .single(),
  );
  const tagNames = [...new Set([...(c.niche.default_tags ?? []), ...seo.tags].map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  if (tagNames.length) {
    const tagRows = tagNames.map((name) => ({ name, slug: slugify(name) })).filter((t) => t.slug);
    const tags = must<{ id: string }[]>(await c.db.from("tags").upsert(tagRows, { onConflict: "slug", ignoreDuplicates: false }).select("id"));
    await c.db.from("post_tags").insert(tags.map((t) => ({ post_id: post.id, tag_id: t.id })));
  }
  await c.db.from("subtopics").update({ status: "used" }).eq("id", sub.id);
  await log(c, "publish", "ok", status === "published" ? `Publicado: /post/${slug}` : `Aguardando revisão: ${slug}`);
  return { id: post.id, slug, status };
}

/** Next scheduled time: now + interval days, at the niche's publish hour (UTC). */
export function nextRun(n: PipelineNiche, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + n.interval_days);
  d.setUTCHours(n.publish_hour, 0, 0, 0);
  return d.toISOString();
}

/** Full automatic cycle for one niche. */
export async function runNiche(c: Ctx) {
  let sub = must<{ id: string; title: string; angle: string }[]>(
    await c.db.from("subtopics").select("id,title,angle").eq("niche_id", c.niche.id).eq("status", "new").order("created_at").limit(1),
  )[0];
  if (!sub) {
    let idea = must<{ id: string; title: string; summary: string }[]>(
      await c.db.from("ideas").select("id,title,summary").eq("niche_id", c.niche.id).eq("status", "new").order("created_at").limit(1),
    )[0];
    if (!idea) idea = (await brainstorm(c))[0] as { id: string; title: string; summary: string };
    if (!idea) throw new Error("A IA não gerou ideias novas.");
    sub = (await expandIdea(c, idea))[0];
  }
  if (!sub) throw new Error("A IA não gerou tópicos.");
  return writeAndPublish(c, sub);
}
