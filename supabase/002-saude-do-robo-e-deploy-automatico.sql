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
