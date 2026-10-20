import type { QueryClient } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/api";
import { siteOrigin } from "@/lib/utils";

/** Dados do site usados nas tags de SEO de cada página. */
export interface SiteMeta {
  name: string;
  tagline: string;
  about: string;
  /** Endereço público sem barra final, já com a subpasta (ex.: https://usuario.github.io/Blog). Vazio se não configurado. */
  origin: string;
  lang: string;
  ogImage: string;
}

export async function loadSite(queryClient: QueryClient): Promise<SiteMeta> {
  const s = await queryClient.ensureQueryData(settingsQuery());
  return {
    name: s.site_name,
    tagline: s.site_tagline,
    about: (s.about ?? "").replace(/\s+/g, " ").trim(),
    origin: siteOrigin(s.site_url ?? ""),
    lang: s.language,
    ogImage: s.og_image_url ?? "",
  };
}

type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };

interface SeoInput {
  site?: SiteMeta | undefined;
  title: string;
  description: string;
  /** Caminho da página sem a subpasta, ex.: "/post/meu-post" (ou "/" para a home). */
  path: string;
  image?: string | undefined;
  type?: "website" | "article";
  noindex?: boolean;
  /** true = não acrescenta " — Nome do site" ao título. */
  bareTitle?: boolean;
}

const isUrl = (u: string) => /^https?:\/\//i.test(u);

/** Título, descrição, canonical e Open Graph/Twitter de uma página, usando o nome e o idioma configurados no admin. */
export function seoHead(i: SeoInput): { meta: MetaTag[]; links: { rel: string; href: string }[] } {
  const site = i.site;
  const name = site?.name ?? "";
  const title = i.bareTitle || !name ? i.title : `${i.title} — ${name}`;
  const url = site?.origin ? `${site.origin}${i.path}` : "";
  const imageRaw = i.image || site?.ogImage || "";
  const image = isUrl(imageRaw) ? imageRaw : "";
  const meta: MetaTag[] = [
    { title },
    { name: "description", content: i.description },
    { property: "og:title", content: title },
    { property: "og:description", content: i.description },
    { property: "og:type", content: i.type ?? "website" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
  ];
  if (name) meta.push({ property: "og:site_name", content: name });
  if (site?.lang) meta.push({ property: "og:locale", content: site.lang.replace("-", "_") });
  if (url) meta.push({ property: "og:url", content: url });
  if (image) meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  if (i.noindex) meta.push({ name: "robots", content: "noindex" });
  return { meta, links: url ? [{ rel: "canonical", href: url }] : [] };
}
