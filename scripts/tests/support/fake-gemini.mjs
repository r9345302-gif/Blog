/**
 * Gemini FALSO: responde no formato que o pipeline espera, sem internet.
 * `behaviors` diz como se comportar, por nome de nicho (ou "*" para todos):
 *   ok | flaky (503 na 1ª tentativa de cada chamada) | err503 | quota (429) | kill (derruba a execução) |
 *   curto (texto abaixo do mínimo) | links (um link interno inventado e um válido) | dup1 (só repete ideias antigas) |
 *   perde (a reestruturação perde texto) | img429 | img400 | imgtext (recusa a imagem)
 */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const reply = (status, text) => ({ status, ok: status < 300, text: async () => text });

export function createFakeGemini({ st, behaviors = {}, advance = () => {} }) {
  const tries = new Map();
  return async function fakeFetch(_url, init) {
    const req = JSON.parse(init.body);
    const prompt = req.contents[0].parts[0].text;
    const cfg = req.generationConfig || {};

    // ----- chamada de IMAGEM -----
    if (cfg.responseModalities && cfg.responseModalities.includes("IMAGE")) {
      const bi = behaviors["*"] ?? "ok";
      advance(8000);
      st.calls = (st.calls || 0) + 1;
      st.imageCalls = (st.imageCalls || 0) + 1;
      if (bi === "img429") return reply(429, '{"error":{"message":"Quota exceeded for metric generate_content_free_tier_requests, limit: 0"}}');
      if (bi === "img400" && cfg.imageConfig) return reply(400, '{"error":{"message":"Unknown name imageConfig"}}');
      if (bi === "imgtext") return reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: "Não posso gerar essa imagem." }] }, finishReason: "STOP" }] }));
      return reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }, { inlineData: { mimeType: "image/png", data: PNG_1X1 } }] }, finishReason: "STOP" }] }));
    }

    // ----- chamadas de TEXTO (JSON) -----
    const step = prompt.includes("textos de referência coletados da web") ? "sources"
      : prompt.includes("gere exatamente 5 ideias NOVAS") ? "brainstorm"
      : prompt.includes("destrinche esta ideia") ? "expand"
      : prompt.includes("Você cria prompts para um gerador de imagens") ? "imgprompt"
      : prompt.includes("perdeu as quebras de linha") ? "heal"
      : prompt.includes("Escreva um artigo de blog completo") ? "write"
      : "seo";
    const niche = (/Nicho: (.*)/.exec(prompt) || [])[1] ?? (/TÍTULO ATUAL: (.*?) ::/.exec(prompt) || [])[1];
    const b = behaviors[niche] ?? behaviors["*"] ?? "ok";
    advance(20000);
    st.calls = (st.calls || 0) + 1;
    if (b === "kill") { advance(14 * 60000); process.exit(137); }
    if (b === "quota") return reply(429, '{"error":"quota"}');
    if (b === "err503") return reply(503, '{"error":"The model is overloaded"}');
    if (b === "flaky") {
      const k = niche + step;
      const n = (tries.get(k) || 0) + 1;
      tries.set(k, n);
      if (n % 2 === 1) return reply(503, '{"error":"The model is overloaded"}');
    }
    let obj;
    const goodSlug = (st.db.posts.find((x) => x.status === "published") || {}).slug;
    if (step === "brainstorm" && b === "dup1" && !prompt.includes("ATENÇÃO: as ideias da tentativa anterior")) {
      obj = { ideas: [1, 2, 3, 4, 5].map((k) => ({ title: `${niche} ideia ${k}`, summary: "repetida" })) };
    } else if (step === "sources") {
      // "copia" = devolve o texto original (para testar o bloqueio de cópia); "inventa" = acrescenta um número que não está na fonte
      const orig = (prompt.split("===== TEXTO [1]")[1] || "").split("\n").slice(1).join(" ").trim();
      const blocks = [{ type: "h2", text: "Seção um" }];
      if (b === "copia") blocks.push({ type: "p", text: orig.slice(0, 2000) });
      for (let i = 0; i < 13; i++) blocks.push({ type: "p", text: "texto novo ".repeat(50).trim() });
      blocks.push({ type: "p", text: b === "inventa" ? "O preço é R$ 4.999 desde 2019." : "O preço é R$ 1.299 desde 2019." });
      obj = { used_sources: [1], title: `${niche} :: reescrito`, excerpt: "resumo", blocks, photo_keyword: "laptop", cover_description: "a desk with a laptop", related_topics: ["tema"] };
    } else if (step === "brainstorm") {
      const base = st.db.ideas.filter((i) => i.niche_id === "n-" + niche).length;
      obj = { ideas: [1, 2, 3, 4, 5].map((k) => ({ title: `${niche} ideia ${base + k}`, summary: "resumo" })) };
    } else if (step === "expand") {
      const idea = /Ideia principal: "(.*)"/.exec(prompt)[1];
      obj = { topics: [1, 2, 3, 4, 5].map((j) => ({ title: `${idea} / tópico ${j}`, angle: "ângulo" })) };
    } else if (step === "write") {
      const topic = /Tópico: "(.*)"/.exec(prompt)[1];
      const target = b === "curto" ? 900 : 1300;
      const blocks = [{ type: "h2", text: "Seção um" }];
      for (let i = 0; i * 100 < target; i++) blocks.push({ type: "p", text: "palavra ".repeat(100).trim() });
      if (b === "links") blocks.push({ type: "p", text: `veja [ruim](/post/nao-existe) e ${goodSlug ? `[bom](/post/${goodSlug})` : "nada"}` });
      obj = { title: `${niche} :: ${topic}`, excerpt: "resumo", blocks };
    } else if (step === "imgprompt") {
      obj = { prompt: "A wide cinematic illustration of a neon-lit city at night with original characters, vibrant colors, digital editorial style", alt: "Ilustração de uma cidade iluminada à noite" };
    } else if (step === "heal") {
      const flat = prompt.split("TEXTO:\n")[1] || "";
      const ws = flat.split(/\s+/).filter(Boolean);
      const keep = b === "perde" ? Math.floor(ws.length * 0.3) : ws.length;
      const blocks = [{ type: "h2", text: "Reestruturado" }];
      for (let i = 0; i < keep; i += 100) blocks.push({ type: "p", text: ws.slice(i, Math.min(i + 100, keep)).join(" ") });
      obj = { blocks };
    } else {
      const title = /TÍTULO ATUAL: (.*)/.exec(prompt)[1];
      obj = { title, meta_description: "meta", slug: slug(title), tags: ["t1", "t2"] };
    }
    return reply(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] }));
  };
}
