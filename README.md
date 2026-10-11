# BlogFlow AI

Quero criar um sistema de postagem de blogs. Como estou imaginando o funcionamento:
1. Vou colocar a minha página de blogs no ar pelo github (Vai ser a página principal)
1.1. Na página principal as pessoas vão poder escolher entre os blogs que aparecem, e quando clicar vai aparecer o blog que ela clicou - da mesma forma que funcionam blogs tradicionais, podendo conversar e discutir sobre o topico, alem de avaliar a relevancia daquele assunto e o que achou sobre o blog
1.2. Os blogs também podem aparecer em ferramentas de pesquisa e etc - Pegue plataformas como blogger e hostingator por exemplo
1.3. As pessoas poderão navegar por tags e assuntos de interesse que elas possuem e facilitar sua navegação
1.4. Quero que a ESTRUTURA, usabilidade e funções do blog sejam semelhantes às imagens que te mandei, mas os assuntos são diferentes e que eu consiga mudar a estrutura caso eu queira na aba de admin
2. Vou ter a aba de admin (Quem entra no site não vai ter acesso a essa aba, vai ser um link especial em que somente eu posso abrir)
2.1. Na página de admin vão ter caixas separando os diferentes nichos de blog que vão ser postados dentro da aba principal de blogs
2.1.1. Posso criar diferentes caixas (Nichos) para cada blog diferente da página
2.1.2. Tenho acesso a dados de quantas visitas aquele blog especifico teve, qual o tempo médio que uma pessoa ficou naquele blog, etc
2.2. Na página de admin vou ter acesso a uma IA que cria esses blogs seguindo uma estrutura principal (Que pode ser mudada e personalizada de acordo com o nicho)
2.2.1. Dentro das caixas de nicho vão ter diferentes etapas para a criação de blog: etapa 1 - Brainstorm (Criação de ideias dentro do nicho para a criação do blog, gera 5 por vez e nunca repete, além saber o que foi usado e não gerar ideias repetidas ou gerais demais), etapa 2 - maior destrinchamento dos tópicos criados na etapa 1 (Sempre destrincha uma ideia gerada na etapa 1 em mais 5 tópicos), etapa 3 - pega uma das ideias geradas na etapa 2 e cria um blog completo de acordo com as preferencias dentro das caixas de blog (Essas preferencias são as configurações dentro da caixa do nicho do blog, podemos chamar de projeto tbm), etapa 4 -procura imagens dentro do proprio google relacionadas com o assunto, as salva e coloca dentro do blog em pontos especificos, etapa 5 - otimiza o blog para facilitar a busca e usa técnicas de SEO e otimização, etapa 6 - Posta o blog
2.2.2. Quero que essa IA trabalhe para mim de forma 100% automatica, só precisando criar os nichos e editar as configurações, após isso, ela faça isso automaticamente
2.3. Nessa página de admin vai ter as configurações para a criação de novos blogs em um intervalo escolhido (Ex. 1 dia, 2 dias, 3 dias, etc) - Essas configurações ficarão dentro dos projetos de cada nicho.
Poderá ser configurada o número mínimo de palavras dentro desse blog, o nome do autor, intervalo, etc
2.3.1. Quero uma configuração geral, em que eu consiga modificar o idioma dos blogs, região, estrutura de todos os blogs e estrutura da página principal

Além disso, tenha em mente que minha pretenção é utilizar o supabase para armazenar dados e o github para as funções e etc

Primeiro faça um plano de ação completo para a criação desse sistema, deixando clara as limitações e estruturando fases para a criação desses blogs e sistema de admin

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
