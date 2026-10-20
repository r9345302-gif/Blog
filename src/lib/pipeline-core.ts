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
  sensitive?: boolean;
}

export interface PipelineSettings {
  language: string;
  region: string;
  post_structure: string;
  site_name: string;
  timezone?: string;
  sensitive_disclaimer?: string;
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
Instruções extras: ${n.extra_instructions || "-"}${n.sensitive ? "\nTEMA SENSÍVEL: não dê aconselhamento individual nem promessa de resultado; use linguagem prudente; não invente dados, estudos ou números; deixe claro que decisões importantes exigem um profissional qualificado." : ""}`;
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
  const ideasSchema = {
    type: "object",
    properties: { ideas: { type: "array", items: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" } }, required: ["title", "summary"] } } },
    required: ["ideas"],
  };
  const key = (t: string) => slugify(t); // "Ideia X!" e "ideia x" contam como a mesma
  const existing = new Set([...ideas, ...posts].map((x) => key(x.title)));
  let rows: { niche_id: string; title: string; summary: string }[] = [];
  let rejected: string[] = [];
  for (let attempt = 1; attempt <= 2 && !rows.length; attempt++) {
    const retryNote =
      attempt === 1 ? "" : `\n\nATENÇÃO: as ideias da tentativa anterior foram recusadas por já existirem (${rejected.slice(0, 5).join("; ")}). Proponha temas realmente diferentes.`;
    const out = await callGemini<{ ideas: { title: string; summary: string }[] }>(c.gemini, prompt + retryNote, ideasSchema);
    const seen = new Set<string>();
    rows = out.ideas
      .filter((i) => {
        const k = i.title ? key(i.title) : "";
        if (!k || existing.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 5)
      .map((i) => ({ niche_id: c.niche.id, title: i.title.trim(), summary: i.summary?.trim() ?? "" }));
    if (!rows.length) rejected = out.ideas.map((i) => i.title).filter(Boolean);
  }
  if (!rows.length) throw new Error("A IA só repetiu ideias já usadas neste nicho (2 tentativas).");
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

/** Bloco de artigo devolvido pelo Gemini. O texto vem em BLOCOS (e não numa string só) porque o Gemini, no modo JSON,
 *  às vezes "engole" as quebras de linha de textos longos e o Markdown vira um parágrafo único com ## soltos. */
interface Block {
  type: string;
  text?: string;
  items?: string[];
}
interface RawDraft {
  title: string;
  excerpt: string;
  blocks?: Block[];
}

const blocksSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["h2", "h3", "p", "ul", "ol", "quote"] },
      text: { type: "string" },
      items: { type: "array", items: { type: "string" } },
    },
    required: ["type"],
  },
};

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Monta o Markdown final a partir dos blocos (quebras de linha garantidas por nós, não pelo modelo). */
export function blocksToMarkdown(blocks: Block[]): string {
  const clean = (s?: string) => (s ?? "").replace(/\s*\n+\s*/g, " ").trim();
  const out: string[] = [];
  for (const b of blocks) {
    const text = clean(b.text);
    const items = (b.items ?? []).map(clean).filter(Boolean);
    if (b.type === "h2" || b.type === "h3") {
      const t = text.replace(/^#+\s*/, "");
      if (t) out.push(`${b.type === "h2" ? "##" : "###"} ${t}`);
    } else if (b.type === "ul" || b.type === "ol" || (!text && items.length)) {
      if (items.length) out.push(items.map((it, i) => (b.type === "ol" ? `${i + 1}. ` : "- ") + it).join("\n"));
    } else if (b.type === "quote") {
      if (text) out.push(`> ${text}`);
    } else if (text) {
      out.push(text);
    }
  }
  return out.join("\n\n");
}

/** Artigo longo sem quebras de linha (texto "achatado"): o defeito que a reestruturação conserta. */
export function isFlatMarkdown(md: string): boolean {
  return md.length > 800 && (md.match(/\n/g) ?? []).length < 4;
}

/** Reestrutura, com o Gemini, um artigo achatado em blocos (sem mudar o conteúdo) e devolve o Markdown correto. */
export async function reformatFlatContent(g: Gemini, flat: string): Promise<string> {
  const prompt = `O texto abaixo é um artigo de blog em Markdown que perdeu as quebras de linha: títulos (## e ###), listas e parágrafos ficaram colados em uma linha só.
Reestruture-o em BLOCOS, na ordem original: "h2", "h3", "p", "ul" ou "ol" (com "items") e "quote".
Regras: preserve TODO o conteúdo, a ordem e as palavras (não resuma, não acrescente nada); separe os parágrafos onde uma frase termina e outra começa sem espaço; títulos viram blocos h2 ou h3 SEM os símbolos #; mantenha negrito, itálico e links [texto](/post/slug) como estão, dentro de "text".

TEXTO:
${flat}`;
  const out = await callGemini<{ blocks: Block[] }>(g, prompt, { type: "object", properties: { blocks: blocksSchema }, required: ["blocks"] });
  const md = blocksToMarkdown(out.blocks ?? []);
  if (wordCount(md) < wordCount(flat) * 0.85) throw new Error("A reestruturação perdeu texto; o original foi mantido.");
  return md;
}

/** Remove links internos ([texto](/post/slug)) para posts que não existem; mantém só o texto. */
async function fixInternalLinks(c: Ctx, md: string): Promise<{ text: string; removed: number }> {
  const norm = (s: string) => {
    try {
      return decodeURIComponent(s).replace(/\/+$/, "");
    } catch {
      return s.replace(/\/+$/, "");
    }
  };
  const slugs = [...new Set([...md.matchAll(/\]\(\/post\/([^)\s#?]+)/g)].map((m) => norm(String(m[1]))))];
  if (!slugs.length) return { text: md, removed: 0 };
  const found = must<{ slug: string }[]>(await c.db.from("posts").select("slug").eq("status", "published").in("slug", slugs));
  const ok = new Set(found.map((r) => r.slug));
  let removed = 0;
  const text = md.replace(/\[([^\]]+)\]\(\/post\/([^)\s#?]+)[^)]*\)/g, (full: string, label: string, slug: string) => {
    if (ok.has(norm(slug))) return full;
    removed++;
    return label;
  });
  return { text, removed };
}

/** Steps 3 + 5 + 6 — write the article, optimise it for search and save/publish it. */
export async function writeAndPublish(c: Ctx, sub: { id: string; title: string; angle: string }) {
  const structure = c.niche.post_structure?.trim() || c.settings.post_structure;
  const min = c.niche.min_words;
  const recent = must<{ title: string; slug: string }[]>(
    await c.db.from("posts").select("title,slug").eq("status", "published").order("published_at", { ascending: false }).limit(40),
  );
  const writePrompt = `${context(c)}

Escreva um artigo de blog completo e original em ${c.settings.language}.
Tópico: "${sub.title}"
Ângulo: ${sub.angle}
Autor (assinatura): ${c.niche.author_name}

Estrutura obrigatória:
${structure}

Regras:
- No mínimo ${min} palavras somando todos os blocos (conte com cuidado; é melhor passar do que ficar abaixo).
- O artigo é uma lista de BLOCOS no campo "blocks", na ordem de leitura. Cada bloco tem "type": "h2" (seção), "h3" (subseção), "p" (parágrafo, em "text"), "ul" ou "ol" (lista, em "items") ou "quote" (citação, em "text"). NÃO inclua o título (H1) nos blocos.
- Em "text" e em "items" use só formatação em linha de Markdown (**negrito**, *itálico*, [texto](/post/slug)); nunca use # nem quebras de linha dentro de um bloco.
- Parágrafos curtos (2 a 4 frases), exemplos concretos, dados apenas quando forem amplamente conhecidos (não invente estatísticas nem fontes).
- Subtítulos (h2) com variações naturais da palavra-chave principal.
- Inclua de 1 a 3 links internos naturais no formato [texto](/post/slug), usando SOMENTE os artigos da lista abaixo e apenas quando fizer sentido.
- "excerpt": 1 a 2 frases instigantes (até 200 caracteres).

Artigos existentes (para links internos):
${recent.map((r) => `- ${r.title} → /post/${r.slug}`).join("\n") || "(nenhum)"}`;
  const draftSchema = {
    type: "object",
    properties: { title: { type: "string" }, excerpt: { type: "string" }, blocks: blocksSchema },
    required: ["title", "excerpt", "blocks"],
  };
  const toDraft = (r: RawDraft): Draft => {
    const content = blocksToMarkdown(r.blocks ?? []);
    if (!content) throw new TransientError("O Gemini não devolveu o texto do artigo.");
    return { title: r.title, excerpt: r.excerpt, content };
  };
  const words = wordCount;
  let draft = toDraft(await callGemini<RawDraft>(c.gemini, writePrompt, draftSchema));
  if (words(draft.content) < min * 0.9) {
    draft = toDraft(
      await callGemini<RawDraft>(
        c.gemini,
        `${writePrompt}\n\nO rascunho abaixo tem só ${words(draft.content)} palavras. Reescreva-o em blocos, expandindo as seções com mais profundidade até passar de ${min} palavras:\n\n${draft.content}`,
        draftSchema,
      ),
    );
  }
  await log(c, "write", "ok", `"${draft.title}" — ${words(draft.content)} palavras`);

  // Step 5 — SEO (só os metadados; o texto não é reescrito)
  const seoPrompt = `Você é especialista em SEO para blogs (${c.settings.language}, região ${c.settings.region}).
Crie os metadados do artigo abaixo, SEM reescrever o texto:
- "title": título com a palavra-chave principal no início, até 65 caracteres, atraente.
- "meta_description": 140 a 160 caracteres, com a palavra-chave e um convite ao clique.
- "slug": curto, minúsculo, com hífens, sem acentos.
- "tags": 3 a 6 tags curtas (1 a 3 palavras cada).

TÍTULO ATUAL: ${draft.title}
RESUMO: ${draft.excerpt}
INÍCIO DO TEXTO:
${draft.content.slice(0, 3500)}`;
  const seo = await callGemini<{ title: string; meta_description: string; slug: string; tags: string[] }>(c.gemini, seoPrompt, {
    type: "object",
    properties: {
      title: { type: "string" },
      meta_description: { type: "string" },
      slug: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["title", "meta_description", "slug", "tags"],
  });
  const chosen = draft.content;
  const { text: linked, removed } = await fixInternalLinks(c, chosen);
  let content = linked;
  if (c.niche.sensitive) {
    // Tema sensível: aviso padrão no fim do texto (editável em Configurações gerais).
    const disclaimer = c.settings.sensitive_disclaimer?.trim() || DEFAULT_SENSITIVE_DISCLAIMER;
    if (!content.includes(disclaimer)) content = `${content.trimEnd()}\n\n> **Aviso:** ${disclaimer}`;
  }
  await log(c, "seo", "ok", `slug: ${seo.slug} | tags: ${seo.tags.join(", ")}${removed ? ` | links internos inválidos removidos: ${removed}` : ""}`);

  // Step 6 — save / publish
  let slug = slugify(seo.slug || seo.title) || slugify(draft.title);
  const clash = must<{ slug: string }[]>(await c.db.from("posts").select("slug").like("slug", `${slug}%`));
  if (clash.some((x) => x.slug === slug)) slug = `${slug}-${clash.length + 1}`;
  // Portão de qualidade: texto bem abaixo do mínimo não vai ao ar sozinho — fica em revisão.
  const finalWords = words(content);
  const tooShort = finalWords < min * 0.8;
  const needsReview = c.niche.require_review || !!c.niche.sensitive || tooShort;
  const status = needsReview ? "pending" : "published";
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
  // O post já está salvo: marca o tópico como usado AGORA, para uma falha nas tags não gerar post repetido.
  await c.db.from("subtopics").update({ status: "used" }).eq("id", sub.id);
  try {
    const tagNames = [...new Set([...(c.niche.default_tags ?? []), ...seo.tags].map((t) => t.trim()).filter(Boolean))].slice(0, 8);
    if (tagNames.length) {
      const tagRows = tagNames.map((name) => ({ name, slug: slugify(name) })).filter((t) => t.slug);
      const tags = must<{ id: string }[]>(await c.db.from("tags").upsert(tagRows, { onConflict: "slug", ignoreDuplicates: false }).select("id"));
      const linked = await c.db.from("post_tags").insert(tags.map((t) => ({ post_id: post.id, tag_id: t.id })));
      if (linked.error) throw new Error(linked.error.message);
    }
  } catch (e) {
    await log(c, "tags", "error", `Post salvo, mas as tags falharam: ${e instanceof Error ? e.message : String(e)}`);
  }
  await log(c, "publish", "ok", status === "published" ? `Publicado: /post/${slug}` : `Aguardando revisão: ${slug}${c.niche.sensitive ? " — tema sensível (revisão obrigatória)" : ""}${tooShort ? ` — texto curto (${finalWords} de ${min} palavras)` : ""}`);
  return { id: post.id, slug, status };
}

const DEFAULT_SENSITIVE_DISCLAIMER = "Este conteúdo tem caráter informativo e não substitui a orientação de um profissional qualificado.";

/** Fuso válido (nome IANA, ex.: America/Sao_Paulo); qualquer coisa inválida vira UTC. */
export function validTimeZone(tz?: string | null): string {
  const t = (tz ?? "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t });
    return t;
  } catch {
    return "UTC";
  }
}

/** Diferença (ms) entre a hora local do fuso e o UTC em um instante. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Próxima publicação: daqui a `interval_days` dias, às `publish_hour` horas NO FUSO informado (padrão UTC). */
export function nextRun(n: PipelineNiche, from = new Date(), timeZone = "UTC") {
  const tz = validTimeZone(timeZone);
  if (tz === "UTC") {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + n.interval_days);
    d.setUTCHours(n.publish_hour, 0, 0, 0);
    return d.toISOString();
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(from);
  const num = (type: string) => Number(day.find((p) => p.type === type)?.value);
  // "dia local + intervalo, às N horas locais" lido como se fosse UTC; depois corrigido pelo deslocamento do fuso
  const wall = Date.UTC(num("year"), num("month") - 1, num("day") + n.interval_days, n.publish_hour, 0, 0);
  let ts = wall - tzOffsetMs(new Date(wall), tz);
  ts = wall - tzOffsetMs(new Date(ts), tz); // 2ª passada: acerta mudança de horário de verão
  return new Date(ts).toISOString();
}

/** Próximo tópico: o mais antigo pendente; sem nenhum, usa uma ideia pendente (ou gera 5 ideias novas) e a destrincha em 5 tópicos. */
async function nextSubtopic(c: Ctx) {
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
  return sub;
}

/** Full automatic cycle for one niche. */
export async function runNiche(c: Ctx) {
  for (let i = 0; i < 10; i++) {
    const sub = await nextSubtopic(c);
    // Se uma execução anterior caiu depois de salvar o post, o tópico já tem post: só marca como usado e segue.
    const already = must<{ id: string }[]>(await c.db.from("posts").select("id").eq("subtopic_id", sub.id).limit(1));
    if (!already.length) return writeAndPublish(c, sub);
    await c.db.from("subtopics").update({ status: "used" }).eq("id", sub.id);
  }
  throw new Error("Os tópicos pendentes já tinham post; tentará de novo na próxima rodada.");
}
