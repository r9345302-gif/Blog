# Guia de implantação

## 1. GitHub
1. No Lovable: menu **+** → GitHub → Connect project → crie o repositório (**público**).
2. No GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Use um domínio próprio (recomendado) ou nomeie o repositório `seuusuario.github.io`.
   Repositórios em subpasta (`seuusuario.github.io/blog`) não são suportados por padrão.

## 2. Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor** → cole todo o conteúdo de `supabase/schema.sql` → Run.
3. **Authentication → Users → Add user** (seu e-mail e senha). Em Authentication → Sign In, desative cadastro público ("Allow new users to sign up").
4. No SQL Editor, rode (trocando o e-mail):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'SEU_EMAIL@exemplo.com';
   ```
5. Em **Project Settings → API**, copie: Project URL, chave pública (anon/publishable) e chave `service_role` (secreta).

## 3. Segredos e variáveis no GitHub
**Settings → Secrets and variables → Actions**

Aba **Secrets** (privados):
| Nome | Valor |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role |
| `GEMINI_API_KEY` | (opcional) se preferir não guardar no banco |

Aba **Variables** (públicas):
| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública |
| `CUSTOM_DOMAIN` | (opcional) ex.: meublog.com |

Para o preview do Lovable usar seu banco, adicione também `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis do projeto Lovable.

## 4. Primeiro uso
1. **Actions → Publicar site → Run workflow**.
2. Acesse `https://seusite/admin`, entre com seu e-mail.
3. **Configurações gerais**: cole a chave do Gemini (aistudio.google.com), defina idioma, região e endereço do site.
4. **Nichos → Novo nicho**: preencha as configurações e clique em "Gerar post agora" para testar.
5. Pronto: o robô (**Actions → Robô de posts**) roda a cada 15 min e publica quando chegar a hora de cada nicho.

## Como funciona
- `generate.yml`: a cada 15 min verifica nichos vencidos, gera ideia → tópicos → artigo → SEO → salva. Se publicou, dispara `deploy.yml`.
- `deploy.yml`: gera o site estático (uma página por post) + sitemap e publica no GitHub Pages. Também roda a cada push e diariamente.
- Erros pausam o nicho e aparecem no histórico do painel; botão "Retomar" reativa.
