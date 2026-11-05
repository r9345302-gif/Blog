# Guia de operação

Para montar o sistema do zero, veja o [DEPLOY.md](../DEPLOY.md). Aqui está o dia a dia e o "o que fazer se…".

## Onde olhar primeiro

**Admin → Saúde do robô.** Mostra a última execução do robô, o último post publicado, o último erro, se há mudanças esperando para ir ao ar, quantos posts aguardam revisão, a situação de cada nicho e os erros recentes. Verde = tudo bem. Vermelho = o robô não executa há mais de 1 hora.

## Rotina sugerida (5 minutos por semana)

1. Abra Saúde do robô: está verde? Algum nicho pausado? Algum erro repetido?
2. Posts → aprove ou ajuste o que está em Revisão.
3. Comentários → "Só pendentes": aprove ou apague.
4. Uma vez por mês: confira em Supabase → Storage → `backups` se há um backup recente.

## O que fazer se…

### O robô parou ou não está postando
1. Saúde do robô: vermelho significa que ele não executa há mais de 1 hora.
2. GitHub → Actions → **Robô de posts (IA)**. Se o workflow estiver desativado, clique em "Enable workflow". O GitHub desliga agendamentos de repositório público depois de 60 dias sem atividade; o workflow **Manter agendamentos ativos** reativa tudo toda segunda-feira.
3. Se a última execução está vermelha, abra o passo que falhou. Se aparecer "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios", falta um secret ou uma variable (veja o DEPLOY.md, seção 3).
4. Se está verde e não há posts novos, é normal em dois casos: nenhum nicho venceu ainda (cada nicho publica no máximo 1 vez por dia, na hora configurada) ou o nicho está pausado ou desativado.
5. Para testar agora: Actions → Robô de posts (IA) → Run workflow.

### Um nicho aparece como "Pausado"
O robô tenta de novo com espera crescente e só pausa depois de 5 falhas em 24 horas. A pausa se desfaz sozinha depois de cerca de 12 horas. O motivo aparece na própria lista de nichos e em Saúde do robô → Erros recentes. Para tentar antes: abra o nicho, clique em "Retomar" e ajuste "Próxima publicação" para agora.

### Aprovei ou editei algo e o site não mudou
A mudança entra no ar em até uns 20 minutos (a próxima rodada do robô pede a recriação). Saúde do robô → Site mostra se há mudanças esperando. Se passar muito disso, abra Actions → **Publicar site**: se estiver vermelho, o passo "Verificar o site gerado" diz o que faltou, e o site anterior continua no ar enquanto isso. Só como último recurso, crie a variável `VERIFY_BUILD` com o valor `off` para publicar sem a verificação.

### Erros do Gemini
- **429 / limite de uso:** o robô tenta aquele nicho de novo em 1 hora. Se a cota do dia acabou, só volta quando ela renovar.
- **403 ou "API key not valid":** a chave está errada ou foi revogada. Troque a chave (próximo item).
- **503 / sobrecarga:** passageiro; o robô repete sozinho.

### Quero trocar a chave do Gemini
1. Crie uma chave nova no Google AI Studio.
2. GitHub → Settings → Secrets and variables → Actions → atualize `GEMINI_API_KEY`.
3. Admin → Configurações gerais → cole a chave nova (é a que os botões manuais do painel usam).
4. Revogue a chave antiga no Google.

### As capas com IA não aparecem
1. Configurações gerais → "Imagens de capa (IA)": a opção está marcada?
2. A API de imagens do Gemini é paga: a chave precisa ser de um projeto com faturamento ativo. Sem isso o erro é 429 e os artigos seguem normais, com a capa de cores.
3. Saúde do robô → Erros recentes: procure o passo `cover`.
4. O robô gera até 2 capas por rodada e no máximo 20 por dia (variável `MAX_COVERS_PER_DAY`), e só para artigos dos últimos 60 dias.

### Chegou spam nos comentários
Comentários com link entram como pendentes. Admin → Comentários → "Só pendentes" → aprove ou apague. O site também limita comentários por visitante e por hora, e tem um campo-isca contra robôs.

### Perdi o app autenticador
No SQL Editor do Supabase, remova o segundo passo da sua conta e entre só com a senha para ativar de novo:
```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'SEU_EMAIL');
```

### Um artigo saiu ruim
Admin → Posts: edite, volte para rascunho ou exclua. Em assuntos delicados, marque o nicho como "Tema sensível": todo artigo vai para revisão e ganha um aviso no fim.

### Perdi dados ou apaguei algo sem querer
1. Supabase → Storage → `backups`: veja os nomes dos arquivos (um por semana, os 8 mais recentes).
2. GitHub → Actions → **Restaurar backup** → Run workflow. Informe o nome do arquivo e deixe "confirmar" vazio: é só uma conferência, nada muda.
3. Se estiver tudo certo, rode de novo digitando **RESTAURAR** em "confirmar". A restauração recria o que sumiu e corrige o que mudou; não apaga o que existir a mais.

### Mudar o endereço do site
Sem domínio próprio, o endereço depende do nome do repositório (variável `SITE_BASE`). Com domínio próprio, use a variável `CUSTOM_DOMAIN` e apague `SITE_BASE`. Depois ajuste "Endereço do site" em Configurações gerais.

### Desfazer uma mudança no banco
Cada arquivo de `supabase/patches/` termina com um bloco "DESFAZER". Rode só o bloco do patch que quer reverter.

## Custos e limites

- **Textos do Gemini:** dependem do plano da sua chave. Cada artigo usa poucas chamadas (escrita e SEO, mais algumas de ideias).
- **Imagens do Gemini:** pagas, cerca de US$ 0,04 por imagem no modelo padrão. Confira o preço atual na página de preços da API.
- **GitHub Actions e Pages:** gratuitos para repositórios públicos.
- **Supabase:** confira os limites do seu plano. Projetos gratuitos podem ser pausados por inatividade; o robô, rodando, mantém o projeto ativo.
- Cada nicho publica no máximo 1 artigo por dia (o intervalo mínimo é 1 dia).
- O site em subpasta do `github.io` tem limites de SEO (por exemplo, o `robots.txt` do site é ignorado). Envie o `sitemap.xml` ao Google Search Console.

## Para quem altera o código

```sh
node --experimental-strip-types --test scripts/tests/*.check.ts
```

Rode antes de enviar mudanças em `scripts/` ou em `src/lib/pipeline-core.ts`. A CI faz o mesmo. As regras para alterar o projeto estão no [AGENTS.md](../AGENTS.md).

## Fontes de referência (reescrever artigos de outros blogs)
- No nicho, ligue **"Usar fontes de referência"** e cole as fontes, uma por linha (feed RSS ou endereço do blog/página). Desligando, o nicho volta ao modo normal (ideias em 6 etapas).
- A cada rodada o robô lê até 3 páginas novas, o Gemini escolhe as do mesmo assunto e escreve um artigo novo mantendo números, preços, datas e nomes. Cada página é usada uma única vez. Os links internos das páginas lidas entram na fila (temas relacionados do próprio blog).
- Vai **sempre para revisão** quando o texto tem trechos de 6 palavras iguais ao original ou números que não aparecem nas fontes.
- Sites que bloqueiam robôs, exigem assinatura ou montam a página só com JavaScript são pulados.
- Sem página nova, o robô confere de novo em 3 h (não conta como falha).
- Riscos: reescrever não elimina direitos autorais, e o Google pode rebaixar sites de conteúdo reescrito em massa. Mantenha "Revisar antes de publicar" e "Citar as fontes" ligados.
- Só funciona no robô automático (o botão de rodar manual do painel mostra um aviso).

## Imagens de capa
- Por nicho, em **Imagem de capa**: seguir Configurações gerais, nenhuma, banco de fotos gratuito ou IA.
- **Banco gratuito:** cadastre a chave do Pexels ou do Unsplash em Configurações gerais (ou secrets `PEXELS_API_KEY` / `UNSPLASH_ACCESS_KEY`). O crédito do fotógrafo aparece abaixo da capa.
- **IA grátis:** crie os secrets `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_AI_TOKEN` (Cloudflare → Workers AI; cerca de 100 imagens/dia no plano gratuito) e o robô usa a Cloudflare no lugar do Gemini (que é pago). A variável `IMAGE_PROVIDER` força `gemini`, `cloudflare` ou `pollinations` (sem chave, sem garantia).
- A imagem dos blogs originais nunca é copiada: a IA cria uma capa nova a partir de uma descrição.

- **Excluir nicho** apaga também todos os posts dele (com comentários, avaliações e visitas). Não há como desfazer.
