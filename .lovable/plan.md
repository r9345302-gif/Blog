# Plano: Sistema de Blogs com Admin e IA Automática

## Visão geral

Um portal de blogs no estilo do Critical Hits (destaques em grade, lista de posts com miniatura, barra lateral de "Últimos", rodapé escuro), com:
- Página pública: home, post, tags/assuntos, busca, comentários e avaliações.
- Painel admin secreto: nichos (projetos), estatísticas, pipeline de IA em 6 etapas e agendamento automático.

## Limitações importantes (leia antes de aprovar)

1. **GitHub Pages não executa servidor.** Ele só hospeda arquivos estáticos; não roda IA, agendamentos nem SEO dinâmico por post. Recomendação: publicar pela hospedagem da Lovable (com domínio próprio, se quiser) e usar o GitHub apenas para **sincronizar o código** (backup, versionamento, edição). Isso mantém tudo funcionando e indexável no Google.
2. **Banco de dados.** Usaremos o Lovable Cloud (banco, login e armazenamento já integrados, sem configuração). Se preferir sua própria conta, é possível conectar em Configurações do projeto → Conectores, mas não pelo chat.
3. **Imagens do Google.** Copiar imagens da busca do Google viola direitos autorais e os termos do Google, e não há API oficial gratuita para isso. Alternativas: (a) banco de imagens livres (Unsplash/Pexels, exige chave grátis), (b) imagens geradas por IA, ou (c) ambos. Vamos usar (b) por padrão e permitir (a) se você fornecer a chave.
4. **"Nunca repetir ideias"** é garantido comparando com o histórico salvo do nicho (títulos e similaridade de texto). Reduz muito a repetição, mas não é 100% perfeito.
5. **Custos de IA.** Cada post gera várias chamadas de IA (ideias, tópicos, texto, imagens, SEO). Há uma cota mensal gratuita pequena; publicações frequentes vão exigir créditos.
6. **Conteúdo 100% automático e Google.** O Google penaliza conteúdo raso. Mitigação: mínimo de palavras, estrutura por nicho, e opção de "revisar antes de postar" (desligável).
7. **Admin.** Além do link secreto, o acesso será protegido por login + papel de administrador (só um link secreto não é seguro).
8. **Estatísticas** (visitas, tempo médio) são coletadas pelo próprio site; não substituem o Google Analytics, mas cobrem o essencial.

## Fases

### Fase 1 – Base e site público
- Visual inspirado nas imagens (grade de destaques, lista com miniatura, barra lateral, rodapé escuro), com identidade própria.
- Páginas: Home, Post (`/post/slug`), Nicho/Categoria, Tag, Busca, Sobre, Privacidade.
- Posts de exemplo para visualização.

### Fase 2 – Banco, login e admin
- Ativar Lovable Cloud; tabelas de nichos, posts, tags, comentários, avaliações, visitas, configurações.
- Login do admin, papel de administrador, rota admin escondida (não aparece no menu, `noindex`).
- CRUD de nichos (as "caixas") e de posts manualmente.

### Fase 3 – Interação dos leitores
- Comentários com respostas (discussão), moderação no admin, proteção anti-spam simples.
- Avaliação de relevância (estrelas) e reação "o que achou".
- Navegação por tags e assuntos, posts relacionados.

### Fase 4 – SEO e indexação
- Título, descrição, Open Graph e dados estruturados (Article) por post.
- `sitemap.xml` e `robots.txt` dinâmicos, URLs amigáveis, idioma/região configuráveis.

### Fase 5 – Estatísticas
- Rastreamento de visitas e tempo de leitura por post.
- Painel por nicho e por post: visitas, tempo médio, avaliações, comentários, gráficos por período.

### Fase 6 – Pipeline de IA (manual primeiro)
Dentro de cada nicho, as 6 etapas, cada uma com botão e histórico:
1. Brainstorm: 5 ideias por vez, sem repetir as já usadas ou genéricas.
2. Destrinchar: 1 ideia → 5 tópicos.
3. Escrever: post completo seguindo as configurações do nicho (estrutura, tom, mínimo de palavras, autor).
4. Imagens: geração/busca e inserção em pontos marcados no texto.
5. SEO: título, meta descrição, slug, tags, subtítulos, links internos.
6. Publicar (ou enviar para revisão).

### Fase 7 – Automação 100%
- Agendador por nicho (a cada 1, 2, 3... dias, horário escolhido) que roda as 6 etapas sozinho.
- Fila com trava contra execução dupla, registro de erros e pausa automática se acabar crédito de IA.
- Log de execuções no admin.

### Fase 8 – Configurações gerais e de estrutura
- Gerais: idioma, região, nome do site, logo, cores.
- Estrutura da home editável: ordem e tipo dos blocos (destaques, lista, barra lateral, por nicho).
- Modelo padrão de estrutura de post, sobrescrevível por nicho.

## Configurações por nicho (projeto)
Nome, descrição, público-alvo, tom de voz, estrutura do post, mínimo de palavras, autor, intervalo de publicação, horário, número de imagens, tags padrão, revisar antes de publicar (sim/não), ativo/pausado.

## Detalhes técnicos
- TanStack Start (SSR, bom para SEO) + Tailwind; hospedagem Lovable; GitHub via sincronização de código.
- Lovable Cloud (Postgres + Auth + Storage), RLS em todas as tabelas, papéis em tabela `user_roles` separada.
- Tabelas: `niches`, `niche_settings`, `site_settings`, `ideas`, `subtopics`, `posts`, `post_images`, `tags`, `post_tags`, `comments`, `ratings`, `page_views`, `pipeline_runs`, `user_roles`.
- IA via Lovable AI Gateway (texto e imagens) em funções de servidor; deduplicação por histórico + embeddings.
- Agendamento: cron do banco chamando rota de servidor protegida, com lote limitado, trava e pausa em erros de crédito.
- Sitemap e robots como rotas de servidor.

## Sugestão de execução
Começar pelas Fases 1 e 2 juntas, validar o visual, e seguir em ordem.
