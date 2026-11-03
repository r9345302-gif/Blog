-- =====================================================================================
-- Patch 006 — Modo "Fontes de referência" por nicho + imagens de banco gratuito
--
-- O que faz (só ADICIONA; nada existente muda):
--   • niches: liga/desliga das fontes, lista de fontes, citar fontes, origem da imagem;
--   • source_items: páginas encontradas nas fontes (cada endereço é usado uma única vez);
--   • posts: fontes usadas, dica de capa, palavra-chave de foto e crédito da foto;
--   • secret_settings: chaves do Pexels e do Unsplash (visíveis só ao admin).
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run. Pode rodar mais de uma vez.
-- ORDEM: rode ANTES de subir o código novo.
-- =====================================================================================
begin;

alter table public.niches
  add column if not exists source_mode boolean not null default false,
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists cite_sources boolean not null default true,
  add column if not exists image_source text not null default 'auto';

alter table public.posts
  add column if not exists source_urls jsonb not null default '[]'::jsonb,
  add column if not exists cover_hint text not null default '',
  add column if not exists photo_keyword text not null default '',
  add column if not exists cover_credit text not null default '';

alter table public.secret_settings
  add column if not exists pexels_api_key text,
  add column if not exists unsplash_access_key text;

create table if not exists public.source_items (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  url text not null,
  status text not null default 'new', -- new | used | error | skipped
  title text not null default '',
  error text not null default '',
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (niche_id, url)
);
grant select, insert, update, delete on public.source_items to authenticated;
grant all on public.source_items to service_role;
alter table public.source_items enable row level security;
drop policy if exists "source_items admin" on public.source_items;
create policy "source_items admin" on public.source_items for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

commit;

-- DESFAZER (rode só se quiser remover):
--   drop table if exists public.source_items;
--   alter table public.niches drop column if exists source_mode, drop column if exists sources,
--     drop column if exists cite_sources, drop column if exists image_source;
--   alter table public.posts drop column if exists source_urls, drop column if exists cover_hint,
--     drop column if exists photo_keyword, drop column if exists cover_credit;
--   alter table public.secret_settings drop column if exists pexels_api_key, drop column if exists unsplash_access_key;
