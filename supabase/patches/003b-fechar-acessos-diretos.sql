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
