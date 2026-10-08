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
