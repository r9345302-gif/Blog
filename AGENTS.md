<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Hosting is GitHub Pages (static): pages must work from a prerendered build (`STATIC_EXPORT=1`); no createServerFn or server routes for app features — why: GitHub Pages has no server.
- Data lives in the user's own Supabase, accessed from the browser with the publishable key; all access control is RLS in `supabase/schema.sql` — why: no backend runtime exists.
- AI pipeline logic lives only in `src/lib/pipeline-core.ts` (import-free) and is shared by the admin panel and `scripts/generate.ts` run by GitHub Actions — why: one source of prompts for manual and automatic runs.
- Without Supabase env vars the site falls back to `src/lib/sample-data.ts` — why: preview works before the database is connected. With Supabase configured, a read error must fail the build (never fall back to sample data) — why: a green deploy must never publish fake posts.

## Regras acrescentadas (fases 1 a 6) — leia antes de mexer
- **Subpasta `/Blog/`:** o site vive em subpasta do GitHub Pages. Use `<Link>` do roteador; para `<a href>` "crus" e arquivos de `public/` use `withBase()` (`src/lib/utils.ts`); para endereços absolutos use `siteOrigin()`. Nunca escreva `href="/..."` direto — o verificador do deploy (`scripts/verify-build.ts`) reprova links sem a subpasta.
- **Metatags:** toda rota usa `loadSite()` no `loader` e `seoHead()` no `head` (`src/lib/seo.ts`). Nome do site, idioma e canonical vêm das configurações, nunca fixos no código.
- **SEO rules** (title/description limits, thin-tag threshold, "updated" rule) live only in import-free `src/lib/seo-rules.ts`, shared by routes and `scripts/build-sitemap.ts` — why: page noindex and sitemap must never disagree.
- **Acesso público ao banco:** o visitante (`anon`) lê só as colunas públicas de `niches` (`NICHE_PUBLIC_COLS` em `src/lib/api.ts`); nunca faça `select("*")` em `niches` no código público. Comentários, avaliações e visitas entram **só** pelas funções `add_comment`, `rate_post` e `track_view` (a inserção direta foi fechada).
- **Mudanças no banco:** crie um arquivo novo em `supabase/patches/NNN-nome.sql` (transação única, pode rodar mais de uma vez, com bloco "DESFAZER" no fim) **e** acrescente o mesmo conteúdo ao fim de `supabase/schema.sql`. Diga ao usuário se o patch roda antes ou depois do código.
- **Agenda do robô:** `next_run_at` e `paused_reason` dos nichos pertencem ao robô (`scripts/generate.ts`). O painel não pode sobrescrevê-los ao salvar um nicho (só se o usuário mudar a data de propósito).
- **Texto dos artigos:** o Gemini devolve o artigo em BLOCOS (`blocks`) e o código monta o Markdown (`blocksToMarkdown`). Não peça Markdown longo dentro de uma string JSON: o modelo "engole" as quebras de linha.
- **Código só de Node** (`sharp`, `node:fs`, etc.) fica em `scripts/`, nunca em `src/lib/pipeline-core.ts` (que é compartilhado com o navegador e não importa nada).
- **Segredos:** nada de chave em arquivo versionado (`.env*` é ignorado). A `service_role` só existe como secret do GitHub.
- **Testes:** rode `node --experimental-strip-types --test scripts/tests/*.check.ts` antes de enviar mudanças em `scripts/` ou `src/lib/pipeline-core.ts` e acrescente um teste para cada comportamento novo. Eles usam banco, Gemini e relógio falsos (`scripts/tests/support/`). A CI roda os mesmos testes.
- **Documentação:** mudou um comportamento que o usuário percebe? Atualize `docs/OPERACAO.md` (e `DEPLOY.md` se mudar a instalação).
