# Modo "Fontes de referência" por nicho (adaptação do plugin)

## O que o plugin faz e como ele vira parte do site
O plugin é para WordPress (PHP) e não roda aqui. Vamos reproduzir a ideia dentro do robô que já existe (GitHub Actions a cada 15 min): ligar/desligar, ler fontes, reescrever com o Gemini e publicar.

## Honestidade: o que dá e o que não dá
**Dá para fazer**
- Liga/desliga por nicho ("Usar fontes de referência"), sem mexer no modo atual (brainstorm em 6 etapas).
- Cadastrar no nicho 1 ou mais fontes: feed RSS ou endereço de página/blog.
- O robô lê a página (texto principal, título, imagem de destaque, links internos) e nunca reutiliza a mesma página (guarda o endereço original).
- Juntar 1 a 3 páginas sobre o mesmo assunto num artigo novo, e seguir links internos do próprio blog-fonte para achar temas relacionados e virar ideias futuras.
- Regras do seu prompt: fatos mantidos, números/preços/datas/nomes idênticos, título novo, estrutura e tom diferentes, proibido inventar dados.
- Checagem automática no código: se o texto novo tiver trechos de 6+ palavras iguais ao original, o artigo é refeito uma vez ou vai para revisão.
- Imagens: (a) banco gratuito Pexels/Unsplash pela palavra-chave, com crédito do fotógrafo; ou (b) capa por IA (já existe no robô) usando como referência a DESCRIÇÃO da imagem original.

**Limites reais**
- Reescrever não elimina o risco de direitos autorais nem a regra do Google contra "conteúdo copiado e reescrito em escala"; sites assim costumam perder ranqueamento. Recomendo deixar a revisão manual ligada nesses nichos e citar a fonte no fim do artigo ("Baseado em: ...") — vou deixar a citação ligada por padrão, com opção de desligar.
- "Nenhuma sequência de 4 palavras igual" não é garantível pelo Gemini; frases comuns ("de acordo com o") sempre se repetem. Usarei 6 palavras como limite verificável.
- Alguns sites bloqueiam robôs (Cloudflare, paywall, páginas montadas só com JavaScript). Esses ficarão com erro "fonte inacessível" e serão pulados.
- Não vamos copiar as imagens dos blogs originais (têm dono). A capa "baseada na imagem original" será uma imagem NOVA inspirada na descrição dela, não uma cópia ou edição.
- A geração de imagem do Gemini é paga (~US$ 0,04 por capa). Alternativas grátis para capas por IA: Cloudflare Workers AI (modelo Flux, chave grátis, cerca de 100 imagens/dia no plano gratuito) como principal, e Pollinations.ai (sem chave, mas sem garantia de funcionamento) como reserva. Pexels/Unsplash também são grátis com chave criada no site deles.
- O pedido de JSON com HTML longo (`content` em HTML) quebra com frequência; manteremos o formato em blocos que o robô já usa e convertido no código.

## Como funciona (por rodada, nicho com o modo ligado)
```text
fontes do nicho -> pega páginas novas (máx. 3) -> extrai texto + imagem + links
 -> Gemini agrupa por assunto e reescreve (prompt abaixo) -> checagem de cópia
 -> imagem (Pexels/Unsplash OU IA) -> SEO -> publica ou vai para revisão
 -> links internos relacionados viram ideias para as próximas rodadas
```

## Prompt (versão ajustada)
"Você é jornalista de SEO e redator sênior. Receberá 1 a 3 textos sobre o mesmo assunto. Escreva um artigo NOVO e original no idioma {idioma}, com no mínimo {palavras} palavras, seguindo a estrutura do nicho {estrutura}.
1. Mantenha os fatos técnicos e conceitos centrais.
2. Proibido inventar dados. Números, estatísticas, preços, datas e nomes próprios devem ser mantidos exatamente como no original; altere só o texto ao redor.
3. Se as fontes discordarem, mostre as duas versões; não escolha uma inventando.
4. Mude completamente estrutura, tom, introdução e conclusão; não copie frases.
5. Crie um título novo e chamativo.
6. Sugira: palavra-chave para busca de foto, descrição de capa (sem texto, marcas ou pessoas reais) e até 5 temas relacionados citados nas fontes.
Responda só no formato JSON pedido."

## O que você verá no painel
- No nicho: chave Liga/Desliga "Fontes de referência", lista de fontes, "Citar fontes no artigo", "Imagem: nenhuma / banco gratuito / IA".
- Em Configurações gerais: campo para chave do Pexels ou Unsplash.
- Nos posts: link das fontes usadas (visível só para você).

## Detalhes técnicos
- Patch `supabase/patches/006-fontes-de-referencia.sql` (+ fim do `schema.sql`): colunas no nicho (`source_mode`, `sources jsonb`, `cite_sources`, `image_source`); tabela `source_items` (url única por nicho, status, título, texto, imagem, links); `posts.source_urls`; chave do banco de fotos em `secret_settings`. Roda ANTES do código.
- `src/lib/pipeline-core.ts` (sem imports): prompt, schema JSON, função de similaridade de n-gramas e agrupamento — compartilhado com o painel.
- `scripts/sources.ts` (Node): baixa RSS/HTML com limite de tempo e tamanho, extrai texto (leitor de artigo), respeita `robots.txt`, User-Agent identificado.
- `scripts/stock-photos.ts`: Pexels/Unsplash, grava crédito; capa IA reaproveita `scripts/covers.ts` recebendo a descrição.
- `scripts/generate.ts`: nichos com modo ligado chamam o novo fluxo; agenda/pausa continuam iguais.
- Testes novos em `scripts/tests/` (fonte falsa, Gemini falso): não repete URL, bloqueia cópia, mantém números, liga/desliga.
- Atualizar `docs/OPERACAO.md` e `DEPLOY.md`.
