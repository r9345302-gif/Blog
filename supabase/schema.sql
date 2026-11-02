-- =====================================================================
-- Sistema de Blogs — esquema completo do banco (cole no SQL Editor do Supabase)
-- Pode ser executado mais de uma vez com segurança em um projeto novo.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Papéis ----------
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

drop policy if exists "own roles readable" on public.user_roles;
create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- ---------- Configurações gerais (públicas) ----------
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  site_name text not null default 'Pauta',
  site_tagline text not null default 'Ideias que valem a leitura',
  about text not null default 'Um portal com artigos diários sobre os assuntos que importam.',
  language text not null default 'pt-BR',
  region text not null default 'BR',
  site_url text not null default '',
  home_layout jsonb not null default '[{"type":"featured","enabled":true},{"type":"latest","enabled":true,"title":"Últimas publicações","sidebar_title":"Mais lidas"},{"type":"niches","enabled":true}]'::jsonb,
  post_structure text not null default E'1. Introdução que prende o leitor (2 parágrafos)\n2. Contexto do problema\n3. 3 a 5 seções com subtítulos (H2) explicando o tema em profundidade\n4. Exemplos práticos ou passo a passo\n5. Perguntas frequentes (3 perguntas)\n6. Conclusão com chamada para comentar',
  social_links jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "settings admin update" on public.site_settings;
create policy "settings admin update" on public.site_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Configurações secretas (chave Gemini) ----------
create table if not exists public.secret_settings (
  id int primary key default 1 check (id = 1),
  gemini_api_key text,
  gemini_model text not null default 'gemini-2.5-flash',
  updated_at timestamptz not null default now()
);
grant select, update on public.secret_settings to authenticated;
grant all on public.secret_settings to service_role;
alter table public.secret_settings enable row level security;
drop policy if exists "secret admin read" on public.secret_settings;
create policy "secret admin read" on public.secret_settings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "secret admin update" on public.secret_settings;
create policy "secret admin update" on public.secret_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
insert into public.secret_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Nichos (projetos) ----------
create table if not exists public.niches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  audience text not null default '',
  tone text not null default 'Informativo, próximo e confiável',
  post_structure text,              -- se vazio, usa a estrutura geral
  extra_instructions text not null default '',
  min_words int not null default 1200 check (min_words between 200 and 6000),
  author_name text not null default 'Redação',
  interval_days int not null default 1 check (interval_days between 1 and 60),
  publish_hour int not null default 9 check (publish_hour between 0 and 23),
  default_tags text[] not null default '{}',
  require_review boolean not null default false,
  active boolean not null default true,
  color text not null default '#d9480f',
  sort_order int not null default 0,
  next_run_at timestamptz not null default now(),
  paused_reason text,
  created_at timestamptz not null default now()
);
grant select on public.niches to anon;
grant select, insert, update, delete on public.niches to authenticated;
grant all on public.niches to service_role;
alter table public.niches enable row level security;
drop policy if exists "niches public read" on public.niches;
create policy "niches public read" on public.niches for select to anon, authenticated using (true);
drop policy if exists "niches admin write" on public.niches;
create policy "niches admin write" on public.niches for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Ideias (etapa 1) ----------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches(id) on delete cascade,
  title text not null,
  summary text not null default '',
  status text not null default 'new' check (status in ('new','expanded','discarded')),
  created_at timestamptz not null default now()
);
create index if not exists ideas_niche_idx on public.ideas(niche_id, status);
grant select, insert, update, delete on public.ideas to authenticated;
grant all on public.ideas to service_role;
alter table public.ideas enable row level security;
drop policy if exists "ideas admin" on public.ideas;
create policy "ideas admin" on public.ideas for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Tópicos (etapa 2) ----------
create table if not exists public.subtopics (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  niche_id uuid not null references public.niches(id) on delete cascade,
  title text not null,
  angle text not null default '',
  status text not null default 'new' check (status in ('new','used','discarded')),
  created_at timestamptz not null default now()
);
create index if not exists subtopics_niche_idx on public.subtopics(niche_id, status);
grant select, insert, update, delete on public.subtopics to authenticated;
grant all on public.subtopics to service_role;
alter table public.subtopics enable row level security;
drop policy if exists "subtopics admin" on public.subtopics;
create policy "subtopics admin" on public.subtopics for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Posts ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid references public.niches(id) on delete set null,
  subtopic_id uuid references public.subtopics(id) on delete set null,
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  meta_description text not null default '',
  author_name text not null default 'Redação',
  status text not null default 'draft' check (status in ('draft','pending','published')),
  featured boolean not null default false,
  word_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_pub_idx on public.posts(status, published_at desc);
create index if not exists posts_niche_idx on public.posts(niche_id);
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;
grant all on public.posts to service_role;
alter table public.posts enable row level security;
drop policy if exists "posts public read" on public.posts;
create policy "posts public read" on public.posts for select to anon, authenticated
  using (status = 'published' or public.has_role(auth.uid(), 'admin'));
drop policy if exists "posts admin write" on public.posts;
create policy "posts admin write" on public.posts for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Tags ----------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);
grant select on public.tags to anon;
grant select, insert, update, delete on public.tags to authenticated;
grant all on public.tags to service_role;
alter table public.tags enable row level security;
drop policy if exists "tags public read" on public.tags;
create policy "tags public read" on public.tags for select to anon, authenticated using (true);
drop policy if exists "tags admin write" on public.tags;
create policy "tags admin write" on public.tags for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
grant select on public.post_tags to anon;
grant select, insert, update, delete on public.post_tags to authenticated;
grant all on public.post_tags to service_role;
alter table public.post_tags enable row level security;
drop policy if exists "post_tags public read" on public.post_tags;
create policy "post_tags public read" on public.post_tags for select to anon, authenticated using (true);
drop policy if exists "post_tags admin write" on public.post_tags;
create policy "post_tags admin write" on public.post_tags for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Comentários ----------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 60),
  body text not null check (char_length(body) between 2 and 3000),
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);
grant select, insert on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
drop policy if exists "comments public read" on public.comments;
create policy "comments public read" on public.comments for select to anon, authenticated
  using (approved or public.has_role(auth.uid(), 'admin'));
drop policy if exists "comments public insert" on public.comments;
create policy "comments public insert" on public.comments for insert to anon, authenticated
  with check (approved = true and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'));
drop policy if exists "comments admin manage" on public.comments;
create policy "comments admin manage" on public.comments for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "comments admin delete" on public.comments;
create policy "comments admin delete" on public.comments for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ---------- Avaliações ----------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 64),
  relevance int not null check (relevance between 1 and 5),
  reaction text check (reaction in ('adorei','util','neutro','fraco')),
  created_at timestamptz not null default now(),
  unique (post_id, session_id)
);
grant insert on public.ratings to anon, authenticated;
grant select, delete on public.ratings to authenticated;
grant all on public.ratings to service_role;
alter table public.ratings enable row level security;
drop policy if exists "ratings public insert" on public.ratings;
create policy "ratings public insert" on public.ratings for insert to anon, authenticated with check (true);
drop policy if exists "ratings admin read" on public.ratings;
create policy "ratings admin read" on public.ratings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.post_rating_summary(_post_id uuid)
returns table (avg_relevance numeric, total bigint, adorei bigint, util bigint, neutro bigint, fraco bigint)
language sql stable security definer set search_path = public as $$
  select round(avg(relevance)::numeric, 1), count(*),
    count(*) filter (where reaction='adorei'), count(*) filter (where reaction='util'),
    count(*) filter (where reaction='neutro'), count(*) filter (where reaction='fraco')
  from public.ratings where post_id = _post_id
$$;
grant execute on function public.post_rating_summary(uuid) to anon, authenticated;

-- ---------- Visitas ----------
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  post_id uuid references public.posts(id) on delete cascade,
  path text not null,
  session_id text not null,
  duration_seconds int not null default 0,
  referrer text,
  created_at timestamptz not null default now()
);
create index if not exists page_views_post_idx on public.page_views(post_id, created_at);
grant select on public.page_views to authenticated;
grant all on public.page_views to service_role;
alter table public.page_views enable row level security;
drop policy if exists "views admin read" on public.page_views;
create policy "views admin read" on public.page_views for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Registro anônimo de visita (com limites) — sem acesso direto à tabela
create or replace function public.track_view(_post_id uuid, _path text, _session text, _seconds int, _referrer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(_session,'')) < 8 or char_length(_session) > 64 then return; end if;
  insert into public.page_views (post_id, path, session_id, duration_seconds, referrer)
  values (_post_id, left(_path, 300), _session, greatest(0, least(coalesce(_seconds,0), 7200)), left(_referrer, 300));
end $$;
grant execute on function public.track_view(uuid, text, text, int, text) to anon, authenticated;

-- Estatísticas para o painel (somente admin)
create or replace function public.admin_post_stats(_days int default 30)
returns table (post_id uuid, niche_id uuid, title text, slug text, views bigint, avg_seconds numeric,
               comments bigint, avg_relevance numeric, ratings bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query
  select p.id, p.niche_id, p.title, p.slug,
    (select count(*) from page_views v where v.post_id = p.id and v.created_at > now() - make_interval(days => _days)),
    (select round(avg(v.duration_seconds)::numeric, 0) from page_views v where v.post_id = p.id and v.duration_seconds > 0 and v.created_at > now() - make_interval(days => _days)),
    (select count(*) from comments c where c.post_id = p.id),
    (select round(avg(r.relevance)::numeric, 1) from ratings r where r.post_id = p.id),
    (select count(*) from ratings r where r.post_id = p.id)
  from posts p where p.status = 'published';
end $$;
grant execute on function public.admin_post_stats(int) to authenticated;

create or replace function public.admin_daily_views(_days int default 30)
returns table (day date, views bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query select v.created_at::date, count(*) from page_views v
    where v.created_at > now() - make_interval(days => _days) group by 1 order by 1;
end $$;
grant execute on function public.admin_daily_views(int) to authenticated;

-- ---------- Execuções do robô ----------
create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid references public.niches(id) on delete cascade,
  step text not null,
  status text not null check (status in ('ok','error','skipped')),
  message text not null default '',
  source text not null default 'robot',
  created_at timestamptz not null default now()
);
create index if not exists runs_created_idx on public.pipeline_runs(created_at desc);
grant select, insert, delete on public.pipeline_runs to authenticated;
grant all on public.pipeline_runs to service_role;
alter table public.pipeline_runs enable row level security;
drop policy if exists "runs admin" on public.pipeline_runs;
create policy "runs admin" on public.pipeline_runs for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Trava do robô ----------
create table if not exists public.pipeline_lock (
  id int primary key default 1 check (id = 1),
  locked_until timestamptz not null default 'epoch'
);
grant all on public.pipeline_lock to service_role;
alter table public.pipeline_lock enable row level security;
insert into public.pipeline_lock (id) values (1) on conflict (id) do nothing;

create or replace function public.acquire_pipeline_lock(_minutes int default 14)
returns boolean language plpgsql security definer set search_path = public as $$
declare got int;
begin
  update public.pipeline_lock set locked_until = now() + make_interval(mins => _minutes)
  where id = 1 and locked_until < now();
  get diagnostics got = row_count;
  return got = 1;
end $$;
create or replace function public.release_pipeline_lock()
returns void language sql security definer set search_path = public as $$
  update public.pipeline_lock set locked_until = 'epoch' where id = 1
$$;
revoke all on function public.acquire_pipeline_lock(int) from public, anon, authenticated;
revoke all on function public.release_pipeline_lock() from public, anon, authenticated;
grant execute on function public.acquire_pipeline_lock(int) to service_role;
grant execute on function public.release_pipeline_lock() to service_role;

-- =====================================================================
-- DEPOIS de criar sua conta (Authentication → Users → Add user),
-- rode a linha abaixo trocando o e-mail para se tornar admin:
--
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'SEU_EMAIL@exemplo.com';
-- =====================================================================

-- =====================================================================================
-- ATUALIZAÇÕES JÁ INCORPORADAS (patches 002 a 005 de supabase/patches/)
-- Num projeto NOVO, rodar este arquivo inteiro basta. Num projeto que já existia, rode só os patches
-- que ainda não rodou, na ordem (veja DEPLOY.md). Todos podem rodar mais de uma vez sem problema.
-- =====================================================================================

-- >>>>>>>>>> PATCH 002 — Painel de saúde do robô e publicação automática do site
-- =====================================================================================
-- Patch 002 — Painel de saúde do robô (Fase 2) + publicação automática do site (Fase 3)
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run. Pode rodar mais de uma vez sem problema.
-- Rode ANTES de subir o código novo. (O código também funciona se o patch ainda não foi aplicado,
-- mas a aba "Saúde do robô" e a recriação automática do site só aparecem depois dele.)
-- Para desfazer, use o bloco "DESFAZER" no fim do arquivo.
-- =====================================================================================

-- 1) Saúde do robô: uma linha única que o robô atualiza a cada execução --------------------
create table if not exists public.robot_status (
  id int primary key default 1 check (id = 1),
  last_run_at timestamptz,
  last_result text not null default '',
  last_publish_at timestamptz,
  last_error text not null default '',
  last_error_at timestamptz
);
insert into public.robot_status (id) values (1) on conflict (id) do nothing;
alter table public.robot_status enable row level security;
grant select on public.robot_status to authenticated;
grant all on public.robot_status to service_role;
drop policy if exists "robot_status admin read" on public.robot_status;
create policy "robot_status admin read" on public.robot_status for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 2) Estado do site: quando o conteúdo público mudou e quando o robô pediu a última recriação --
create table if not exists public.site_state (
  id int primary key default 1 check (id = 1),
  content_changed_at timestamptz not null default now(),
  deploy_requested_at timestamptz not null default now()
);
insert into public.site_state (id) values (1) on conflict (id) do nothing;
alter table public.site_state enable row level security;
grant select on public.site_state to authenticated;
grant all on public.site_state to service_role;
drop policy if exists "site_state admin read" on public.site_state;
create policy "site_state admin read" on public.site_state for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 3) Gatilhos: toda mudança que aparece no site público marca "conteúdo mudou" ---------------
create or replace function public.touch_site_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.site_state set content_changed_at = now() where id = 1;
  return null;
end $$;
revoke all on function public.touch_site_state() from public, anon, authenticated;

-- posts: só conta quando o post está (ou estava) publicado
create or replace function public.touch_site_state_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.status = 'published')
     or (tg_op = 'UPDATE' and (old.status = 'published' or new.status = 'published'))
     or (tg_op = 'DELETE' and old.status = 'published') then
    update public.site_state set content_changed_at = now() where id = 1;
  end if;
  return null;
end $$;
revoke all on function public.touch_site_state_posts() from public, anon, authenticated;

drop trigger if exists posts_touch_site on public.posts;
create trigger posts_touch_site after insert or update or delete on public.posts
  for each row execute function public.touch_site_state_posts();

-- tags: renomear ou apagar muda o site (criar uma tag nova, sozinha, não)
drop trigger if exists tags_touch_site on public.tags;
create trigger tags_touch_site after update or delete on public.tags
  for each statement execute function public.touch_site_state();

-- ligações post↔tag: só contam quando o post está publicado
create or replace function public.touch_site_state_post_tags()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  st text;
begin
  pid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  select status into st from public.posts where id = pid;
  if st = 'published' then
    update public.site_state set content_changed_at = now() where id = 1;
  end if;
  return null;
end $$;
revoke all on function public.touch_site_state_post_tags() from public, anon, authenticated;

drop trigger if exists post_tags_touch_site on public.post_tags;
create trigger post_tags_touch_site after insert or update or delete on public.post_tags
  for each row execute function public.touch_site_state_post_tags();

drop trigger if exists site_settings_touch_site on public.site_settings;
create trigger site_settings_touch_site after update on public.site_settings
  for each statement execute function public.touch_site_state();

-- nichos: só mudanças visíveis no site (o robô muda next_run_at o tempo todo e isso NÃO conta)
drop trigger if exists niches_touch_site_ins_del on public.niches;
create trigger niches_touch_site_ins_del after insert or delete on public.niches
  for each statement execute function public.touch_site_state();

drop trigger if exists niches_touch_site_upd on public.niches;
create trigger niches_touch_site_upd after update on public.niches
  for each row
  when (old.name is distinct from new.name
     or old.slug is distinct from new.slug
     or old.description is distinct from new.description
     or old.color is distinct from new.color
     or old.sort_order is distinct from new.sort_order
     or old.active is distinct from new.active)
  execute function public.touch_site_state();

-- 4) updated_at automático (o sitemap usa essa data como "última alteração") -----------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- =====================================================================================
-- DESFAZER (só se precisar; apaga os gatilhos e as duas tabelas):
--   drop trigger if exists posts_touch_site on public.posts;
--   drop trigger if exists tags_touch_site on public.tags;
--   drop trigger if exists post_tags_touch_site on public.post_tags;
--   drop trigger if exists site_settings_touch_site on public.site_settings;
--   drop trigger if exists niches_touch_site_ins_del on public.niches;
--   drop trigger if exists niches_touch_site_upd on public.niches;
--   drop trigger if exists posts_set_updated_at on public.posts;
--   drop trigger if exists site_settings_set_updated_at on public.site_settings;
--   drop function if exists public.touch_site_state(), public.touch_site_state_posts(), public.touch_site_state_post_tags(), public.set_updated_at();
--   drop table if exists public.site_state, public.robot_status;
-- =====================================================================================

-- >>>>>>>>>> PATCH 003a — Limites e funções anti-abuso (comentários, avaliações, visitas)
-- =====================================================================================
-- Patch 003a — Fase 4 (segurança e anti-abuso), PARTE A: só ADICIONA coisas (não quebra nada)
--
-- O que faz:
--   • cria o contador de limites (rate_limits) e as funções que o usam;
--   • add_comment: comentários com isca anti-robô, limites por visitante e moderação de links;
--   • rate_post: avaliações com limites;
--   • track_view: visitas com limite por visitante e por página.
-- Nenhum IP é guardado: só um "carimbo" (hash) temporário numa tabela fechada ao público.
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run. Pode rodar mais de uma vez.
-- ORDEM: rode este arquivo (003a) PRIMEIRO, depois suba o código novo no GitHub e espere o
-- "Publicar site" terminar, e só então rode o 003b (que fecha as portas antigas).
-- =====================================================================================
begin;

-- 1) Contador de limites (ninguém acessa direto; só as funções abaixo) --------------------
create table if not exists public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant all on public.rate_limits to service_role;

-- true = ainda dentro do limite; false = passou do limite na janela de _seconds
create or replace function public.rate_limit_hit(_bucket text, _max int, _seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _hits int;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (_bucket, now(), 1)
  on conflict (bucket) do update
    set window_start = case when r.window_start < now() - make_interval(secs => _seconds) then now() else r.window_start end,
        hits = case when r.window_start < now() - make_interval(secs => _seconds) then 1 else r.hits + 1 end
  returning r.hits into _hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return _hits <= _max;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;

-- "Carimbo" do visitante: hash do IP informado pelo Supabase (null quando não houver IP)
create or replace function public.client_key()
returns text
language sql stable set search_path = public as $$
  select md5(nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '') || '|blog')
  where nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '') is not null
$$;
revoke all on function public.client_key() from public, anon, authenticated;

-- 2) Comentários: entrada única, com isca anti-robô, limites e moderação ---------------------
-- Retorna: 'approved' (já aparece), 'pending' (aguarda aprovação), 'limited' (muitos pedidos) ou 'invalid'
create or replace function public.add_comment(
  _post_id uuid, _author text, _body text,
  _parent_id uuid default null, _hp text default '', _session text default ''
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  ck text := public.client_key();
  a text := btrim(coalesce(_author, ''));
  b text := btrim(coalesce(_body, ''));
  review boolean;
begin
  -- isca: pessoas nunca preenchem este campo escondido; robôs preenchem. Finge que deu certo.
  if btrim(coalesce(_hp, '')) <> '' then return 'approved'; end if;

  if char_length(a) < 2 or char_length(a) > 60 or char_length(b) < 2 or char_length(b) > 3000 then return 'invalid'; end if;
  if not exists (select 1 from public.posts where id = _post_id and status = 'published') then return 'invalid'; end if;
  if _parent_id is not null and not exists (
    select 1 from public.comments where id = _parent_id and post_id = _post_id and approved
  ) then return 'invalid'; end if;

  -- limites: no site todo, por visitante (10 min e 24 h) ou, sem IP, por sessão
  if not public.rate_limit_hit('comment:all', 200, 3600) then return 'limited'; end if;
  if ck is not null then
    if not public.rate_limit_hit('comment:ip10:' || ck, 5, 600) then return 'limited'; end if;
    if not public.rate_limit_hit('comment:ip24:' || ck, 20, 86400) then return 'limited'; end if;
  elsif char_length(coalesce(_session, '')) between 8 and 64 then
    if not public.rate_limit_hit('comment:ses:' || _session, 3, 600) then return 'limited'; end if;
  end if;

  -- comentário com link espera aprovação (spam quase sempre traz link)
  review := (a || ' ' || b) ~* '(https?://|www\.)';
  insert into public.comments (post_id, parent_id, author_name, body, approved)
  values (_post_id, _parent_id, a, b, not review);
  return case when review then 'pending' else 'approved' end;
end $$;
grant execute on function public.add_comment(uuid, text, text, uuid, text, text) to anon, authenticated;

-- 3) Avaliações: entrada única com limites (a 1ª avaliação do leitor vale, como hoje) ---------
-- Retorna: 'ok', 'limited' ou 'invalid'
create or replace function public.rate_post(_post_id uuid, _session text, _relevance int, _reaction text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  ck text := public.client_key();
begin
  if _relevance is null or _relevance < 1 or _relevance > 5 then return 'invalid'; end if;
  if char_length(coalesce(_session, '')) < 8 or char_length(_session) > 64 then return 'invalid'; end if;
  if _reaction is not null and _reaction not in ('adorei', 'util', 'neutro', 'fraco') then _reaction := null; end if;
  if not exists (select 1 from public.posts where id = _post_id and status = 'published') then return 'invalid'; end if;

  if not public.rate_limit_hit('rate:all', 600, 3600) then return 'limited'; end if;
  if ck is not null and not public.rate_limit_hit('rate:ip:' || ck, 30, 3600) then return 'limited'; end if;

  insert into public.ratings (post_id, session_id, relevance, reaction)
  values (_post_id, _session, _relevance, _reaction)
  on conflict (post_id, session_id) do nothing;
  return 'ok';
end $$;
grant execute on function public.rate_post(uuid, text, int, text) to anon, authenticated;

-- 4) Visitas: mesma função de antes, agora com limite por visitante e por página --------------
create or replace function public.track_view(_post_id uuid, _path text, _session text, _seconds int, _referrer text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ck text := public.client_key();
begin
  if char_length(coalesce(_session,'')) < 8 or char_length(_session) > 64 then return; end if;
  if ck is not null and not public.rate_limit_hit('view:ip:' || ck, 400, 3600) then return; end if;
  if not public.rate_limit_hit('view:' || coalesce(ck, _session) || ':' || coalesce(_post_id::text, left(coalesce(_path, ''), 100)), 3, 1800) then return; end if;
  insert into public.page_views (post_id, path, session_id, duration_seconds, referrer)
  values (_post_id, left(_path, 300), _session, greatest(0, least(coalesce(_seconds,0), 7200)), left(_referrer, 300));
end $$;

notify pgrst, 'reload schema';
commit;

-- =====================================================================================
-- DESFAZER (só se precisar): restaura o track_view antigo e apaga o que este patch criou
--   create or replace function public.track_view(_post_id uuid, _path text, _session text, _seconds int, _referrer text)
--   returns void language plpgsql security definer set search_path = public as $fn$
--   begin
--     if char_length(coalesce(_session,'')) < 8 or char_length(_session) > 64 then return; end if;
--     insert into public.page_views (post_id, path, session_id, duration_seconds, referrer)
--     values (_post_id, left(_path, 300), _session, greatest(0, least(coalesce(_seconds,0), 7200)), left(_referrer, 300));
--   end $fn$;
--   drop function if exists public.add_comment(uuid, text, text, uuid, text, text);
--   drop function if exists public.rate_post(uuid, text, int, text);
--   drop function if exists public.client_key();
--   drop function if exists public.rate_limit_hit(text, int, int);
--   drop table if exists public.rate_limits;
-- =====================================================================================

-- >>>>>>>>>> PATCH 003b — Fecha as portas diretas (niches por colunas, comentários e avaliações só pelas funções)
-- =====================================================================================
-- Patch 003b — Fase 4 (segurança e anti-abuso), PARTE B: FECHA as portas antigas
--
-- O que faz:
--   • niches: visitantes passam a ler só as colunas que o site usa (seus prompts, a agenda do
--     robô e as mensagens de erro deixam de ser públicos);
--   • comments e ratings: deixam de aceitar inserção direta (só pelas funções add_comment e
--     rate_post, que têm limites).
--
-- ATENÇÃO À ORDEM: rode este arquivo SÓ DEPOIS de (1) rodar o 003a, (2) subir o código novo no
-- GitHub e (3) o "Publicar site" terminar com sucesso. Antes disso, o site antigo ainda usa as
-- portas que este arquivo fecha.
--
-- Como usar: Supabase → SQL Editor → cole TUDO → Run.
-- =====================================================================================
begin;

-- niches: o visitante (anon) só enxerga as colunas públicas; contas logadas que NÃO são admin não veem nada
-- (o admin continua vendo tudo pela política "niches admin write", que já existe)
revoke select on public.niches from anon;
grant select (id, name, slug, description, color, sort_order, active) on public.niches to anon;
drop policy if exists "niches public read" on public.niches;
create policy "niches public read" on public.niches for select to anon using (true);

-- comentários: só pela função add_comment
drop policy if exists "comments public insert" on public.comments;
revoke insert on public.comments from anon, authenticated;

-- avaliações: só pela função rate_post
drop policy if exists "ratings public insert" on public.ratings;
revoke insert on public.ratings from anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- =====================================================================================
-- DESFAZER (volta ao comportamento anterior):
--   begin;
--   grant select on public.niches to anon;
--   drop policy if exists "niches public read" on public.niches;
--   create policy "niches public read" on public.niches for select to anon, authenticated using (true);
--   grant insert on public.comments to anon, authenticated;
--   create policy "comments public insert" on public.comments for insert to anon, authenticated
--     with check (approved = true and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'));
--   grant insert on public.ratings to anon, authenticated;
--   create policy "ratings public insert" on public.ratings for insert to anon, authenticated with check (true);
--   notify pgrst, 'reload schema';
--   commit;
-- =====================================================================================

-- >>>>>>>>>> PATCH 004 — SEO, fuso horário e política editorial
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

-- >>>>>>>>>> PATCH 005 — Capas de artigo geradas por IA
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
