-- =====================================================================================
-- Patch 005 — Fase 5 (parte b): imagens de capa geradas pelo Gemini
--
-- O que faz (só ADICIONA; nada existente muda):
--   • posts: endereço da capa, da miniatura e o texto alternativo;
--   • site_settings: liga/desliga das capas, estilo visual e legenda;
--   • cria o "balde" público post-images no Supabase Storage (limite de 5 MB por arquivo).
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run. Pode rodar mais de uma vez.
-- ORDEM: rode ANTES de subir o código novo (o site passa a pedir as novas colunas).
-- As capas só começam a ser geradas depois que você marcar "Gerar capa com IA" em
-- Configurações gerais. Para desfazer, use o bloco "DESFAZER" no fim.
-- =====================================================================================
begin;

alter table public.posts
  add column if not exists cover_url text not null default '',
  add column if not exists cover_thumb_url text not null default '',
  add column if not exists cover_alt text not null default '';

alter table public.site_settings
  add column if not exists cover_images boolean not null default false,
  add column if not exists cover_style text not null default 'ilustração digital editorial, composição limpa, cores vibrantes, sem texto',
  add column if not exists cover_caption text not null default 'Ilustração gerada por IA';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

notify pgrst, 'reload schema';
commit;

-- =====================================================================================
-- DESFAZER (só se precisar; as imagens já enviadas continuam no Storage):
--   alter table public.posts drop column if exists cover_url, drop column if exists cover_thumb_url, drop column if exists cover_alt;
--   alter table public.site_settings drop column if exists cover_images, drop column if exists cover_style, drop column if exists cover_caption;
-- =====================================================================================
