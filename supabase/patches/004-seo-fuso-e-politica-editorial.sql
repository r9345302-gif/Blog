-- =====================================================================================
-- Patch 004 — Fase 5 (parte a): SEO, fuso horário e política editorial
--
-- O que faz (só ADICIONA colunas; nada existente muda):
--   • site_settings: imagem padrão de compartilhamento, fuso horário, aviso de IA,
--     política editorial e aviso para temas sensíveis;
--   • niches: marcação "tema sensível" (revisão manual obrigatória + aviso no fim do texto).
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run. Pode rodar mais de uma vez.
-- ORDEM: rode ANTES de subir o código novo (o painel passa a salvar esses campos).
-- Para desfazer, use o bloco "DESFAZER" no fim.
-- =====================================================================================
begin;

alter table public.site_settings
  add column if not exists og_image_url text not null default '',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists ai_disclosure text not null default 'Este texto foi produzido com o auxílio de inteligência artificial.',
  add column if not exists editorial_policy text not null default E'Os artigos deste site são produzidos com o auxílio de inteligência artificial e publicados de forma automatizada, seguindo diretrizes editoriais definidas para cada assunto.\n\nNossos textos têm caráter informativo e podem conter imprecisões. Em temas sensíveis, como saúde, finanças e questões jurídicas, o conteúdo não substitui a orientação de um profissional qualificado.\n\nEncontrou um erro ou quer pedir uma correção? Fale com a equipe do site.',
  add column if not exists sensitive_disclaimer text not null default 'Este conteúdo tem caráter informativo e não substitui a orientação de um profissional qualificado.';

-- (a coluna não entra nas colunas públicas de niches: o visitante não precisa dela)
alter table public.niches
  add column if not exists sensitive boolean not null default false;

notify pgrst, 'reload schema';
commit;

-- =====================================================================================
-- DESFAZER (só se precisar):
--   alter table public.site_settings
--     drop column if exists og_image_url, drop column if exists timezone, drop column if exists ai_disclosure,
--     drop column if exists editorial_policy, drop column if exists sensitive_disclaimer;
--   alter table public.niches drop column if exists sensitive;
-- =====================================================================================
