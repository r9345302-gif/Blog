# Plano: Sistema de Blogs com Admin e IA Automática (Gemini + Supabase + GitHub)

## Resposta à sua dúvida: o site cai quando é recriado?
Não. O GitHub Pages troca a versão antiga pela nova de uma vez só, quando a nova já está pronta. Quem estiver lendo continua vendo a página normalmente; o post novo aparece ao recarregar ou navegar. Comentários, avaliações e visitas não dependem da recriação, pois falam direto com o Supabase em tempo real. Se uma recriação falhar, a versão anterior continua no ar.

## Arquitetura definida

```text
 Leitor ──> GitHub Pages (site pronto, uma página por post, ótimo para Google)
              │  comentários / avaliações / visitas / login admin
              v
           Supabase (banco + login + regras de acesso)
              ^
              │ lê nichos, chave Gemini, grava ideias e posts
 GitHub Actions (a cada 15 min) ──> Gemini API
              │ se publicou algo
              v
         recria e republica o site
```

- Hospedagem: GitHub Pages (repositório público, Actions ilimitado).
- Banco e login: seu próprio Supabase (você cria e conecta depois de ir ao GitHub).
- IA: Gemini, chave cadastrada no painel admin (Configurações gerais), salva no banco e legível só pelo admin e pelo robô.
- Robô: GitHub Actions a cada 15 min verifica nichos com post "vencido" e roda as etapas.
- Sem geração de imagens por enquanto (posts usam capa padrão do nicho / cor + título).
- Revisão antes de publicar: configurável por nicho.

## Limitações e ressalvas
1. **Preview na Lovable:** o site será construído como site estático + Supabase. Antes de você conectar o Supabase, o preview mostra dados de exemplo.
2. **Atraso de publicação:** o agendamento do GitHub roda "a cada 15 min" mas pode atrasar 5–30 min em horários de pico; a recriação do site leva ~1–3 min.
3. **Chave Gemini no banco:** protegida por regras de acesso (só admin lê). Alternativa mais segura: guardar também como segredo do GitHub; o robô usa o segredo se existir, senão a do banco.
4. **Cotas do Gemini:** o plano gratuito tem limites por minuto/dia; o robô processa poucos posts por execução e pausa o nicho em caso de erro de cota.
5. **Admin no site estático:** a página admin existe no site, mas não aparece em menus, não é indexada e só funciona após login com conta marcada como admin no banco. Sem login, nada é exibido nem retornado.
6. **"Nunca repetir ideias":** comparação com todo o histórico do nicho; reduz drasticamente a repetição, sem garantia absoluta.
7. **Conteúdo automático e Google:** mínimo de palavras e estrutura por nicho ajudam a evitar conteúdo raso.

## Fases

### Fase 1 – Site público (visual)
Layout inspirado nas imagens: topo com logo e menu de nichos, grade de destaques, lista com miniatura/autor/data/resumo, barra lateral "Últimos", "Carregar mais", rodapé escuro. Páginas: Home, Post, Nicho, Tag, Busca, Sobre, Privacidade. Dados de exemplo.

### Fase 2 – Banco (SQL entregue)
Arquivo SQL completo para colar no Supabase: tabelas, regras de acesso, função de papel admin, índices e dados iniciais de configuração. Tabelas: `site_settings`, `niches`, `ideas`, `subtopics`, `posts`, `tags`, `post_tags`, `comments`, `ratings`, `page_views`, `pipeline_runs`, `user_roles`.

### Fase 3 – Painel admin
Login, caixas de nicho (criar/editar/pausar), configurações do nicho, lista de posts (editar, aprovar, despublicar), moderação de comentários, Configurações gerais (chave Gemini, idioma, região, nome do site, estrutura da home e estrutura padrão dos posts).

### Fase 4 – Interação dos leitores
Comentários com respostas, avaliação de relevância (estrelas) e "o que achou", navegação por tags/assuntos, posts relacionados.

### Fase 5 – Estatísticas
Registro de visitas e tempo de leitura; painel por nicho e por post (visitas, tempo médio, avaliações, comentários, gráfico por período).

### Fase 6 – Robô de IA (GitHub Actions)
Script executado a cada 15 min:
1. Brainstorm: 5 ideias novas, sem repetir histórico nem ideias genéricas.
2. Destrinchar: 1 ideia → 5 tópicos.
3. Escrever: post completo seguindo as configurações do nicho.
4. (Imagens: desativado nesta versão.)
5. SEO: título, meta descrição, slug, tags, subtítulos, links internos.
6. Publicar ou deixar "aguardando revisão"; se publicou, dispara a recriação do site.
Inclui trava contra execução dupla, limite de posts por execução, registro de cada execução no admin e pausa automática em erros. Botão no admin para rodar uma etapa manualmente para testes.

### Fase 7 – SEO do site
Página pronta por post com título, descrição, Open Graph, dados estruturados (Article), `sitemap.xml` e `robots.txt` gerados a cada recriação, idioma/região das configurações.

### Fase 8 – Guia de implantação
Passo a passo: conectar ao GitHub, criar o Supabase, rodar o SQL, criar sua conta admin, cadastrar segredos no GitHub, ativar o GitHub Pages e cadastrar a chave Gemini no painel.

## Configurações por nicho
Nome, descrição, público-alvo, tom de voz, estrutura do post, mínimo de palavras, autor, intervalo (1, 2, 3... dias), horário, tags padrão, revisão antes de publicar, ativo/pausado.

## Detalhes técnicos
- Front: React + TanStack Router em modo estático (pré-renderização das páginas de posts no build); Supabase JS no navegador com chave pública e RLS.
- Admin: rota oculta com `noindex`, checagem de papel via função `has_role` (tabela `user_roles` separada).
- RLS: leitura pública só de posts publicados, nichos ativos, comentários aprovados; insert anônimo em `comments`, `ratings`, `page_views` com limites; tudo mais só admin. `site_settings.gemini_api_key` em tabela/coluna acessível só a admin e `service_role`.
- Segredos no GitHub (Settings → Secrets → Actions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, opcional `GEMINI_API_KEY`; variáveis públicas do build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Workflows: `generate.yml` (cron `*/15 * * * *`, Node script chamando Gemini via REST e Supabase com service role; ao publicar, aciona `deploy.yml`) e `deploy.yml` (build estático + publicação no Pages; também em push).
- Não serão necessárias edge functions do Supabase: o robô roda no GitHub Actions com acesso seguro pelos segredos.
- Trava: linha `pipeline_lock` com expiração; idempotência por status de ideia/tópico/post.
