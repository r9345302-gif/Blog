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
- Without Supabase env vars the site falls back to `src/lib/sample-data.ts` — why: preview works before the database is connected.
