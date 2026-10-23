import type { Niche, Post, SiteSettings, Tag } from "./types";

export const defaultSettings: SiteSettings = {
  site_name: "Pauta",
  site_tagline: "Ideias que valem a leitura",
  about:
    "A Pauta reúne artigos diários sobre finanças pessoais, tecnologia, saúde e viagens — explicados com profundidade e sem enrolação.",
  language: "pt-BR",
  region: "BR",
  site_url: "",
  home_layout: [
    { type: "featured", enabled: true },
    { type: "latest", enabled: true, title: "Últimas publicações", sidebar_title: "Mais recentes" },
    { type: "niches", enabled: true },
  ],
  post_structure: "",
  social_links: {},
  og_image_url: "",
  timezone: "UTC",
  ai_disclosure: "Este texto foi produzido com o auxílio de inteligência artificial.",
  editorial_policy:
    "Os artigos deste site são produzidos com o auxílio de inteligência artificial e publicados de forma automatizada, seguindo diretrizes editoriais definidas para cada assunto.\n\nNossos textos têm caráter informativo e podem conter imprecisões. Em temas sensíveis, como saúde, finanças e questões jurídicas, o conteúdo não substitui a orientação de um profissional qualificado.\n\nEncontrou um erro ou quer pedir uma correção? Fale com a equipe do site.",
  sensitive_disclaimer: "Este conteúdo tem caráter informativo e não substitui a orientação de um profissional qualificado.",
  cover_images: false,
  cover_style: "ilustração digital editorial, composição limpa, cores vibrantes, sem texto",
  cover_caption: "Ilustração gerada por IA",
};

const n = (id: string, name: string, slug: string, color: string, description: string): Niche => ({
  id,
  name,
  slug,
  description,
  audience: "",
  tone: "",
  post_structure: null,
  extra_instructions: "",
  min_words: 1200,
  author_name: "Redação",
  interval_days: 1,
  publish_hour: 9,
  default_tags: [],
  require_review: false,
  sensitive: false,
  active: true,
  color,
  sort_order: 0,
  next_run_at: new Date().toISOString(),
  paused_reason: null,
});

export const sampleNiches: Niche[] = [
  n("n1", "Finanças", "financas", "#d9480f", "Dinheiro, investimentos e organização financeira."),
  n("n2", "Tecnologia", "tecnologia", "#1971c2", "Ferramentas, IA e o futuro digital."),
  n("n3", "Saúde", "saude", "#2b8a3e", "Bem-estar, sono, alimentação e movimento."),
  n("n4", "Viagens", "viagens", "#9c36b5", "Destinos, roteiros e dicas para viajar melhor."),
];

const t = (name: string): Tag => ({ id: name, name, slug: name.toLowerCase().replace(/\s+/g, "-") });

const body = `Este é um **artigo de exemplo**. Assim que o banco de dados estiver conectado, os posts criados pela IA aparecerão aqui.

## Por que isso importa

Um bom artigo começa entendendo a dúvida do leitor. Nesta seção, o texto explicaria o contexto do assunto com exemplos concretos.

## Passo a passo

1. Entenda o problema.
2. Compare as alternativas.
3. Aplique a solução e acompanhe os resultados.

## Perguntas frequentes

**Isso funciona para iniciantes?** Sim — o conteúdo é escrito para ser claro em qualquer nível.

## Conclusão

Gostou? Deixe sua avaliação e participe da conversa nos comentários abaixo.`;

const titles: [string, number, string[]][] = [
  ["Reserva de emergência: quanto guardar e onde deixar o dinheiro em 2026", 0, ["Investimentos", "Planejamento"]],
  ["Agentes de IA no trabalho: o que já dá para automatizar hoje", 1, ["IA", "Produtividade"]],
  ["Sono profundo: 7 hábitos que a ciência confirma", 2, ["Sono", "Hábitos"]],
  ["Lisboa em 4 dias: roteiro sem pressa e com orçamento real", 3, ["Europa", "Roteiros"]],
  ["Tesouro Direto ou CDB? Uma comparação honesta", 0, ["Investimentos"]],
  ["Como escolher um notebook para estudar programação", 1, ["Hardware", "Guia de compra"]],
  ["Caminhar 30 minutos por dia muda mesmo alguma coisa?", 2, ["Exercício", "Hábitos"]],
  ["Milhas aéreas para iniciantes: o guia sem jargão", 3, ["Dicas", "Economia"]],
];

export const samplePosts: Post[] = titles.map(([title, ni, tags], i) => {
  const niche = sampleNiches[ni]!;
  const date = new Date(Date.UTC(2026, 9, 8 - i, 12)).toISOString();
  return {
    id: `p${i}`,
    niche_id: niche.id,
    title,
    slug: `exemplo-${i + 1}`,
    excerpt:
      "Um resumo curto e direto do que o leitor vai encontrar neste artigo, escrito para despertar a curiosidade.",
    content: body,
    meta_description: title,
    author_name: "Redação",
    status: "published",
    featured: i < 4,
    word_count: 1300,
    published_at: date,
    created_at: date,
    niche: { id: niche.id, name: niche.name, slug: niche.slug, color: niche.color },
    tags: tags.map(t),
  };
});
