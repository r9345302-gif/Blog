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
