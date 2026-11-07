
-- ===== Patch 008: perfis de autoria (rode ANTES de publicar o código) =====
begin;
create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null default 'equipe_editorial' check (kind in ('pessoa','equipe_editorial','assistente_ia')),
  role_label text not null default '',
  bio text not null default '',
  avatar_url text,
  links jsonb not null default '{}'::jsonb,
  disclosure text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.authors to anon, authenticated;
grant insert, update, delete on public.authors to authenticated;
grant all on public.authors to service_role;
alter table public.authors enable row level security;
drop policy if exists "authors public read" on public.authors;
create policy "authors public read" on public.authors for select to anon, authenticated
  using (active or public.has_role(auth.uid(), 'admin'));
drop policy if exists "authors admin write" on public.authors;
create policy "authors admin write" on public.authors for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.niche_authors (
  niche_id uuid not null references public.niches(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  weight int not null default 1 check (weight between 1 and 100),
  primary key (niche_id, author_id)
);
revoke all on public.niche_authors from anon;
grant select, insert, update, delete on public.niche_authors to authenticated;
grant all on public.niche_authors to service_role;
alter table public.niche_authors enable row level security;
drop policy if exists "niche_authors admin all" on public.niche_authors;
create policy "niche_authors admin all" on public.niche_authors for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- "fixo" = usa o autor do nicho (como antes); "rodar" = alterna entre os perfis do nicho.
alter table public.niches add column if not exists author_mode text not null default 'fixo';
alter table public.niches drop constraint if exists niches_author_mode_check;
alter table public.niches add constraint niches_author_mode_check check (author_mode in ('fixo','rodar'));

alter table public.posts add column if not exists author_id uuid references public.authors(id) on delete set null;
create index if not exists posts_author_id_idx on public.posts(author_id);
commit;
-- DESFAZER (rode depois de voltar o código anterior):
-- begin;
-- alter table public.posts drop column if exists author_id;
-- alter table public.niches drop constraint if exists niches_author_mode_check;
-- alter table public.niches drop column if exists author_mode;
-- drop table if exists public.niche_authors;
-- drop table if exists public.authors;
-- commit;
