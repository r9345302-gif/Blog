# BlogFlow AI

Sistema de blogs por assunto ("nichos") que se escreve e se publica sozinho.

- **Site:** React + TanStack Start, publicado como site estático (uma página HTML por artigo) no GitHub Pages.
- **Dados, login e imagens:** Supabase (banco, autenticação e Storage).
- **Robô:** GitHub Actions (`.github/workflows/generate.yml`, a cada ~15 minutos). Usa o Gemini para criar ideias, tópicos, artigo, SEO e capa, e publica.
- **Painel:** `/admin` — nichos, posts, comentários, estatísticas, saúde do robô e configurações gerais.

## Como o robô trabalha

1. A cada rodada ele olha os nichos que já venceram (cada nicho tem a própria agenda) e atende um de cada vez, do mais atrasado para o mais novo (até 2 por rodada).
2. Para cada nicho: ideias → tópicos → artigo em blocos (títulos, parágrafos, listas) → metadados de SEO → publica, ou manda para revisão (nichos com revisão obrigatória, temas sensíveis e textos curtos demais).
3. Se algo falha, tenta de novo com espera crescente. Só pausa um nicho depois de várias falhas, e a pausa se desfaz sozinha.
4. Depois dos posts: gera capas com IA (se estiver ligado) e reestrutura artigos antigos sem quebras de linha.
5. Se o conteúdo público mudou (post aprovado, configuração editada...), pede a recriação do site. O site também é recriado todo dia às 06:00 UTC.
6. Toda semana, copia os dados para um balde privado do Supabase (backup).

## Documentos

| Quero… | Leia |
|---|---|
| Montar tudo do zero (GitHub, Supabase, chaves) | [DEPLOY.md](DEPLOY.md) |
| Operar no dia a dia e resolver problemas ("o que fazer se…") | [docs/OPERACAO.md](docs/OPERACAO.md) |
| Ver o pedido original do projeto | [docs/REQUISITOS-ORIGINAIS.md](docs/REQUISITOS-ORIGINAIS.md) |
| Regras para quem altera o código (inclusive o Lovable) | [AGENTS.md](AGENTS.md) |

## Mapa do projeto

| Pasta | O que tem |
|---|---|
| `src/routes/`, `src/components/` | O site público e o painel `/admin` |
| `src/lib/pipeline-core.ts` | O pipeline de IA (ideias → artigo → SEO). Compartilhado entre o robô e o painel; não pode importar nada |
| `src/lib/seo.ts`, `api.ts`, `types.ts` | Metatags, acesso aos dados e tipos |
| `scripts/` | O robô (`generate.ts`, `covers.ts`), o verificador do site (`verify-build.ts`), o sitemap, o backup e a restauração |
| `scripts/tests/` | Testes do robô, do pipeline e do backup |
| `supabase/schema.sql` | Banco completo. `supabase/patches/` guarda as atualizações separadas |
| `.github/workflows/` | `generate` (robô), `deploy` (site), `keepalive`, `backup`, `restore` e `ci` |

## Testes

```sh
node --experimental-strip-types --test scripts/tests/*.check.ts
```

Rodam sem internet e sem chaves (banco, Gemini e relógio são falsos). A CI (`.github/workflows/ci.yml`) roda os mesmos testes a cada envio para a `main`.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5484f058-ee1e-47ec-a78b-081ad4c129c7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
