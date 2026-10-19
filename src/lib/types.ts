export type HomeBlock =
  | { type: "featured"; enabled: boolean }
  | { type: "latest"; enabled: boolean; title?: string; sidebar_title?: string }
  | { type: "niches"; enabled: boolean };

export interface SiteSettings {
  site_name: string;
  site_tagline: string;
  about: string;
  language: string;
  region: string;
  site_url: string;
  home_layout: HomeBlock[];
  post_structure: string;
  social_links: Record<string, string>;
  og_image_url: string;
  timezone: string;
  ai_disclosure: string;
  editorial_policy: string;
  sensitive_disclaimer: string;
}

export interface Niche {
  id: string;
  name: string;
  slug: string;
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
  sensitive: boolean;
  active: boolean;
  color: string;
  sort_order: number;
  next_run_at: string;
  paused_reason: string | null;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Post {
  id: string;
  niche_id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  meta_description: string;
  author_name: string;
  status: "draft" | "pending" | "published";
  featured: boolean;
  word_count: number;
  published_at: string | null;
  created_at: string;
  updated_at?: string | null;
  niche?: Pick<Niche, "id" | "name" | "slug" | "color"> | null;
  tags?: Tag[];
}

export interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  approved: boolean;
  created_at: string;
}
