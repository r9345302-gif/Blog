/**
 * Capas de bancos de fotos GRATUITOS (Pexels ou Unsplash), para nichos com "Imagem: banco gratuito".
 * Usa a palavra-chave que o Gemini sugeriu (photo_keyword) e grava o crédito do fotógrafo (exigido pelos bancos).
 * As fotos são exibidas direto do banco (permitido pelos termos dos dois serviços); nada é copiado de outros blogs.
 */
type DB = any;

export interface StockOptions {
  db: DB;
  pexelsKey?: string | null;
  unsplashKey?: string | null;
  maxPerRun: number;
  hasTime: () => boolean;
}

interface Photo {
  full: string;
  thumb: string;
  alt: string;
  credit: string;
}

export async function searchPexels(key: string, q: string): Promise<Photo | null> {
  const r = await fetch(`https://api.pexels.com/v1/search?per_page=5&orientation=landscape&query=${encodeURIComponent(q)}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Pexels respondeu ${r.status}`);
  const j: any = await r.json();
  const p = j?.photos?.[0];
  if (!p) return null;
  return { full: p.src?.large2x || p.src?.large, thumb: p.src?.medium || p.src?.large, alt: p.alt || q, credit: `Foto: ${p.photographer} / Pexels` };
}

export async function searchUnsplash(key: string, q: string): Promise<Photo | null> {
  const r = await fetch(`https://api.unsplash.com/search/photos?per_page=5&orientation=landscape&query=${encodeURIComponent(q)}`, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Unsplash respondeu ${r.status}`);
  const j: any = await r.json();
  const p = j?.results?.[0];
  if (!p) return null;
  // Os termos do Unsplash pedem para avisar o "download" ao usar a foto.
  if (p.links?.download_location) fetch(`${p.links.download_location}&client_id=${key}`).catch(() => {});
  return { full: `${p.urls.raw}&w=1280&q=80&fm=jpg&fit=crop`, thumb: `${p.urls.raw}&w=480&q=70&fm=webp&fit=crop`, alt: p.alt_description || q, credit: `Foto: ${p.user?.name} / Unsplash` };
}

/** Dá foto aos artigos sem capa dos nichos com "banco gratuito". Devolve quantas fotos foram colocadas. */
export async function addStockPhotos(o: StockOptions): Promise<number> {
  if (!o.pexelsKey && !o.unsplashKey) return 0;
  const { data: posts } = await o.db
    .from("posts")
    .select("id,niche_id,title,photo_keyword,niche:niches(image_source)")
    .in("status", ["published", "pending"])
    .eq("cover_url", "")
    .order("created_at", { ascending: false })
    .limit(30);
  let done = 0;
  for (const p of posts ?? []) {
    if (done >= o.maxPerRun || !o.hasTime()) break;
    const n = Array.isArray(p.niche) ? p.niche[0] : p.niche;
    if (n?.image_source !== "stock") continue;
    // Falhou nas últimas 24 h? Não insiste.
    const { count: failed } = await o.db
      .from("pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("step", "photo")
      .eq("status", "error")
      .like("message", `post ${p.id}:%`)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((failed ?? 0) > 0) continue;
    const q = (p.photo_keyword || p.title || "").trim();
    try {
      const photo = (o.pexelsKey ? await searchPexels(o.pexelsKey, q) : null) ?? (o.unsplashKey ? await searchUnsplash(o.unsplashKey, q) : null);
      if (!photo) throw new Error(`nenhuma foto para "${q}"`);
      await o.db.from("posts").update({ cover_url: photo.full, cover_thumb_url: photo.thumb, cover_alt: String(photo.alt).slice(0, 200), cover_credit: photo.credit.slice(0, 200) }).eq("id", p.id);
      await o.db.from("pipeline_runs").insert({ niche_id: p.niche_id, step: "photo", status: "ok", message: `post ${p.id}: ${photo.credit}`, source: "robot" });
      console.log(`  📷 foto de banco gratuito: ${p.title}`);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  sem foto para "${p.title}": ${msg}`);
      await o.db.from("pipeline_runs").insert({ niche_id: p.niche_id, step: "photo", status: "error", message: `post ${p.id}: ${msg}`.slice(0, 2000), source: "robot" });
    }
  }
  return done;
}
