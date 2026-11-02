# Como colocar no ar

O site roda no GitHub Pages, os dados no Supabase e o robô no GitHub Actions. Leva cerca de 30 minutos. Depois de no ar, o dia a dia está em [docs/OPERACAO.md](docs/OPERACAO.md).

## 1. GitHub

1. O repositório precisa ser **público** (Actions e Pages gratuitos).
2. Settings → Pages → Source: **GitHub Actions**.
3. Endereço do site:
   - **Sem domínio próprio:** o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`. Crie a variável `SITE_BASE` com `/NOME-DO-REPOSITORIO/` (ex.: `/Blog/`).
   - **Com domínio próprio:** crie a variável `CUSTOM_DOMAIN` com o domínio, aponte o DNS para o GitHub Pages e **não** crie `SITE_BASE`. (Com domínio próprio o `robots.txt` passa a valer e a troca de endereço futura deixa de existir.)
4. Settings → Code security: ligue **Secret scanning** e **Push protection**.

## 2. Supabase

1. Crie um projeto em supabase.com.
2. SQL Editor → cole todo o `supabase/schema.sql` → Run. Num projeto novo basta isso: o arquivo já inclui todas as atualizações.
3. Authentication → Users → Add user (e-mail e senha, já confirmado).
4. SQL Editor → transforme esse usuário em admin:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'SEU_EMAIL'
   on conflict (user_id, role) do nothing;
   ```
5. Authentication → Sign In / Providers: desligue **"Allow new users to sign up"** e confira que o MFA por app autenticador (TOTP) está ligado.
6. Project Settings → API: anote a URL, a chave pública (publishable) e a chave secreta (service_role).

## 3. Chaves no GitHub

Settings → Secrets and variables → Actions.

**Secrets** (guardam segredos; ninguém vê depois de salvos):

| Nome | Obrigatório | Para quê |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | sim | O robô e o backup escrevem no banco. Nunca mostre nem cole essa chave em lugar nenhum |
| `GEMINI_API_KEY` | não | Chave do Gemini do robô. Sem ela, o robô usa a chave salva em Admin → Configurações gerais |
| `SUPABASE_URL` | não | Se não existir, usa a variável `VITE_SUPABASE_URL` |
| `ALERT_WEBHOOK_URL` | não | Aviso (Discord, Slack ou Telegram) quando um nicho é pausado |

**Variables** (podem ser públicas):

| Nome | Obrigatório | Para quê |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | Endereço do projeto no Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sim | Chave pública (vai no site de qualquer forma) |
| `SITE_BASE` | só em subpasta | Ex.: `/Blog/` |
| `CUSTOM_DOMAIN` | só com domínio próprio | Ex.: `meublog.com` |
| `VERIFY_BUILD` | não | `off` desliga a verificação antes de publicar. Use só para destravar um problema |
| `GEMINI_IMAGE_MODEL` | não | Modelo de imagem das capas (padrão: `gemini-2.5-flash-image`) |
| `MAX_COVERS_PER_DAY` | não | Teto de capas geradas por dia (padrão: 20) |

## 4. Primeiro uso

1. Actions → **Publicar site** → Run workflow.
2. Abra `/admin` no endereço do site e entre. Em Configurações gerais → "Segurança da conta", ative a verificação em duas etapas.
3. Em Configurações gerais, preencha o nome, o **endereço do site** (com a subpasta, ex.: `https://usuario.github.io/Blog`), o idioma, o fuso horário e os textos.
4. Cole a chave do Gemini (ou use o secret `GEMINI_API_KEY`).
5. Crie um nicho e clique em "Gerar post agora" para testar. Esse botão conta como o post do dia desse nicho.
6. Actions → **Robô de posts** → Run workflow. A partir daí ele roda sozinho a cada ~15 minutos.

## 5. Projeto que já existia: atualizações do banco

O `schema.sql` completo só serve para projetos novos. Num projeto antigo, rode no SQL Editor só os patches que ainda não rodou, em ordem. Todos podem rodar mais de uma vez, e cada um traz no fim o bloco "DESFAZER".

| Arquivo (`supabase/patches/`) | O que faz | Quando rodar |
|---|---|---|
| `002-saude-do-robo-e-deploy-automatico.sql` | Aba Saúde do robô e recriação automática do site | Antes de subir o código |
| `003a-limites-e-funcoes.sql` | Limites anti-abuso e funções de comentário, avaliação e visita | Antes de subir o código |
| `003b-fechar-acessos-diretos.sql` | Fecha as portas diretas (niches por colunas, comentários e avaliações só pelas funções) | **Depois** que o código novo foi publicado |
| `004-seo-fuso-e-politica-editorial.sql` | Fuso horário, política editorial, tema sensível | Antes de subir o código |
| `005-capas-com-ia.sql` | Capas de artigo geradas por IA e o balde de imagens | Antes de subir o código |

## 6. Segurança

- Nunca coloque a `service_role` em arquivo do projeto, print ou conversa. Ela só existe como secret do GitHub.
- Mantenha o cadastro público desligado e a verificação em duas etapas ativada.
- O backup semanal fica num balde **privado** (Supabase → Storage → `backups`). Não inclui a chave do Gemini.
