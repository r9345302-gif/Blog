import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ settingsQuery: () => ({}) }));

import { seoHead, type SiteMeta } from "@/lib/seo";
import { buildTitle, clampText, isThinTag, wasUpdated } from "@/lib/seo-rules";

const site: SiteMeta = { name: "Blog", tagline: "", about: "", origin: "https://x.github.io/Blog", lang: "pt-BR", ogImage: "" };

describe("clampText", () => {
  it("texto curto volta igual", () => expect(clampText("Olá mundo", 20)).toBe("Olá mundo"));
  it("texto longo corta em palavra e põe …", () => {
    const r = clampText("um dois três quatro cinco seis sete", 20);
    expect(r).toBe("um dois três…");
    expect([...r].length).toBeLessThanOrEqual(20);
  });
  it("sem espaço corta no limite", () => expect(clampText("a".repeat(30), 10)).toBe("a".repeat(9) + "…"));
  it("conta acentos como um caractere", () => expect(clampText("ação ação ação", 14)).toBe("ação ação ação"));
});

describe("título", () => {
  it("curto mantém o nome do site", () => expect(buildTitle("Post", "Blog")).toBe("Post — Blog"));
  it("longo cabe em 60 e tira o nome do site", () => {
    const t = buildTitle("Palavra ".repeat(12), "Blog");
    expect([...t].length).toBeLessThanOrEqual(60);
    expect(t).not.toContain("Blog");
  });
});

describe("seoHead", () => {
  const base = { site, title: "Post", description: "Desc", path: "/post/a", image: "https://img/a.jpg" };
  it("sem os campos novos não gera robots, alt nem article:*", () => {
    const m = JSON.stringify(seoHead(base).meta);
    expect(m).not.toMatch(/robots|image:alt|article:/);
  });
  it("com os campos novos gera as tags", () => {
    const { meta } = seoHead({ ...base, robots: "index,follow,max-image-preview:large", imageAlt: "Capa", articleSection: "Animes", articleTags: ["a", "b"] });
    expect(meta).toContainEqual({ name: "robots", content: "index,follow,max-image-preview:large" });
    expect(meta).toContainEqual({ property: "og:image:alt", content: "Capa" });
    expect(meta).toContainEqual({ property: "article:section", content: "Animes" });
    expect(meta.filter((x) => "property" in x && x.property === "article:tag")).toHaveLength(2);
  });
  it("descrição longa vai até 155", () => {
    const { meta } = seoHead({ ...base, description: "palavra ".repeat(40) });
    const d = meta.find((x) => "name" in x && x.name === "description") as { content: string };
    expect([...d.content].length).toBeLessThanOrEqual(155);
  });
});

describe("regras", () => {
  it("tag com 1 ou 2 posts é fina; com 3 não", () => {
    expect(isThinTag(2)).toBe(true);
    expect(isThinTag(3)).toBe(false);
  });
  it("atualizado só após 24h", () => {
    expect(wasUpdated("2026-01-01T00:00:00Z", "2026-01-01T23:00:00Z")).toBe(false);
    expect(wasUpdated("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(true);
  });
});
