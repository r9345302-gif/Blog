# Fase 0 — Auditoria (nenhum arquivo foi alterado)

## 1. Como o projeto funciona hoje
1. Site estático (TanStack Start pré-renderizado) publicado no GitHub Pages, na subpasta `/Blog/`.
2. Dados no Supabase do usuário, lidos pelo navegador e pelo build com a chave pública; o controle de acesso fica todo nas regras RLS de `supabase/schema.sql`.
3. Páginas públicas: início, `/post/$slug`, `/nicho/$slug`, `/tag/$slug`, `/arquivo`, `/busca`, `/sobre`, `/privacidade`; `/admin` só funciona no navegador.
4. Toda rota usa `loadSite()` no loader e `seoHead()` no head (título, descrição, canonical, Open Graph).
5. O robô (`scripts/generate.ts`, Actions a cada 15 min) usa `pipeline-core.ts`: brainstorm → tópicos → artigo em blocos → SEO → publicação ou revisão.
6. Modo "fontes de referência" opcional por nicho: lê RSS ou páginas, reescreve e checa trechos copiados e números.
7. Capas opcionais: Cloudflare/Pollinations/Gemini ou fotos Pexels/Unsplash, com miniatura e crédito.
8. O deploy gera o site, depois `build-sitemap.ts` (sitemap/robots/lang), depois `verify-build.ts` (barra a publicação se faltar algo).
9. Comentários, avaliações e visitas entram só por funções do banco (`add_comment`, `rate_post`, `track_view`).
10. Sem banco configurado, o site usa dados de exemplo; com banco configurado, um erro de leitura derruba o build.

## 2. Checagem
- **a) Subpasta /Blog/ nos links** — OK em geral. Os `<Link>` recebem o prefixo pelo roteador. Os links internos do Markdown passam por `withBase` (`post.$slug.tsx`, linhas 98-100). O `verify-build.ts` (linhas 38-50) só confere a **página inicial**. PROBLEMA: nada confere as páginas de post, tag, nicho e arquivo.
- **b) Tamanho do título e da descrição** — PROBLEMA. `seoHead` (`seo.ts`, linhas 49-56) não corta nada: o título vira "título — nome do site" sem limite, e a descrição vem crua de `meta_description`/`excerpt` (`post.$slug.tsx`, linha 23). Só o que o prompt pede ao Gemini limita o tamanho. Nenhuma regra no código garante esses limites.
- **c) Canonical** — OK na forma: `origin + path`, sem barra final (`seo.ts`, linha 50). PROBLEMA possível: o GitHub Pages serve `/post/x/` (pasta com `index.html`) e redireciona `/post/x` para essa forma com barra. O canonical sem barra aponta para um endereço que redireciona. Isso precisa ser confirmado no site no ar.
- **d) noindex** — `/busca`: OK, usa `noindex` (`busca.tsx`, linha 13), mas sem `follow` explícito. `/admin`: OK, usa `noindex, nofollow` (`admin.tsx`), e `robots.txt` também bloqueia `/admin`.
- **e) Tags finas no sitemap** — PROBLEMA. `build-sitemap.ts` (linhas 38 e 61) inclui todas as tags, sem contar posts. A página de tag (`tag.$slug.tsx`) também não tem noindex.
- **f) Capa** — PROBLEMA em partes (`Cover.tsx`, linha 13). O texto alternativo fica vazio quando `cover_alt` está vazio. Não há width/height, mas o contêiner tem proporção fixa (`aspect-[21/9]` no post), então o risco de a página "pular" é baixo. A capa do topo usa `eager`, mas não tem `fetchpriority="high"`. As listas usam `lazy`.
- **g) Dados estruturados (JSON-LD)** — PROBLEMA (`post.$slug.tsx`, linhas 36-49). Só existe BlogPosting: o autor não tem url, `image` é uma URL única (absoluta só se `cover_url` for absoluta), o publisher não tem logo e `dateModified` aparece sempre. Faltam BreadcrumbList e WebSite/Organization (a home não tem nenhum).
- **h) "Leia também"** — `postsQuery({ nicheId, limit: 6 })` (`post.$slug.tsx`, linhas 19 e 67) traz os 6 posts mais recentes do mesmo nicho, remove o atual e mostra até 5. Não usa tags nem relevância.
- **i) author_name** — `posts.author_name`: `api.ts` (linha 7, colunas lidas), `post.$slug.tsx` (linhas 24 e 82), `PostCards.tsx` (linha 9), `PostsTab.tsx` (linhas 73 e 91, edição), `pipeline-core.ts` (linha 430, gravado ao publicar), `sample-data.ts`. `niches.author_name`: `NichesTab.tsx` (linha 140), `pipeline-core.ts` (linhas 18, 325, 588, no prompt e na assinatura), `types.ts` (linha 36), testes (`sim.ts`). (`Comments.tsx` e `CommentsTab.tsx` usam o `author_name` dos comentários, que é outra coisa.)

## 3. Tabelas atuais (nome: tipo)
- **posts**: id uuid, niche_id uuid (o patch 007 muda para apagar junto), subtopic_id uuid, title text, slug text único, excerpt text, content text, meta_description text, author_name text, status text (draft/pending/published), featured bool, word_count int, published_at timestamptz, created_at timestamptz, updated_at timestamptz; acrescentadas por patches: cover_url, cover_thumb_url, cover_alt, cover_credit text, source_urls jsonb.
- **niches**: id uuid, name, slug único, description, audience, tone, post_structure (pode ser nulo), extra_instructions text, min_words int, author_name text, interval_days int, publish_hour int, default_tags text[], require_review bool, active bool, color text, sort_order int, next_run_at timestamptz, paused_reason text, created_at timestamptz; acrescentadas: sensitive bool, source_mode bool, sources (lista), cite_sources bool, image_source text.
- **ideas**: id uuid, niche_id uuid (apaga junto com o nicho), title text, summary text, status text (new/expanded/discarded), created_at timestamptz.
- **site_settings** (linha única, id=1): site_name, site_tagline, about, language, region, site_url text, home_layout jsonb, post_structure text, social_links jsonb, updated_at timestamptz; acrescentadas: og_image_url, timezone, ai_disclosure, editorial_policy, sensitive_disclaimer, cover_style, cover_caption text, cover_images bool.

## Observações para as próximas fases
- Os tipos das colunas acrescentadas por patches foram tirados de `types.ts` e dos patches. Antes da Fase 2 vale conferir no banco real.
- Fase 1, item 2: o JSON-LD hoje usa a capa só se for URL absoluta; as capas do Supabase Storage já são absolutas.
- Ao aprovar, sigo para a Fase 1 quando você enviar.
