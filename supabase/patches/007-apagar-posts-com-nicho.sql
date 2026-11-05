
-- ===== Patch 007: apagar o nicho apaga os posts dele =====
begin;
alter table public.posts drop constraint if exists posts_niche_id_fkey;
alter table public.posts add constraint posts_niche_id_fkey
  foreign key (niche_id) references public.niches(id) on delete cascade;
commit;
-- DESFAZER:
-- begin;
-- alter table public.posts drop constraint if exists posts_niche_id_fkey;
-- alter table public.posts add constraint posts_niche_id_fkey
--   foreign key (niche_id) references public.niches(id) on delete set null;
-- commit;
