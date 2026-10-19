import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/api";
import { loadSite, seoHead } from "@/lib/seo";

export const Route = createFileRoute("/sobre")({
  loader: async ({ context: { queryClient } }) => ({ site: await loadSite(queryClient) }),
  head: ({ loaderData }) =>
    seoHead({
      site: loaderData?.site,
      title: "Sobre nós",
      description: loaderData?.site ? `Conheça a proposta e a equipe por trás de ${loaderData.site.name}.` : "Conheça a proposta e a equipe do site.",
      path: "/sobre",
    }),
  component: About,
});

function About() {
  const { data } = useSuspenseQuery(settingsQuery());
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-5xl font-black">Sobre nós</h1>
      <p className="mt-6 font-serif text-xl leading-relaxed">{data.about}</p>
      {data.editorial_policy?.trim() && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-2xl font-black">Como produzimos o conteúdo</h2>
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{data.editorial_policy}</p>
        </section>
      )}
    </div>
  );
}
