import { createFileRoute } from "@tanstack/react-router";
import { loadSite, seoHead } from "@/lib/seo";

export const Route = createFileRoute("/privacidade")({
  loader: async ({ context: { queryClient } }) => ({ site: await loadSite(queryClient) }),
  head: ({ loaderData }) =>
    seoHead({ site: loaderData?.site, title: "Política de privacidade", description: "Como coletamos e usamos dados de navegação.", path: "/privacidade" }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="prose-article mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-sans text-5xl font-black">Privacidade</h1>
      <p>Registramos de forma anônima quais páginas são visitadas e por quanto tempo, para entender quais assuntos interessam mais aos leitores. Não usamos esses dados para identificar você.</p>
      <p>Ao comentar, o nome informado e o texto ficam públicos. Avaliações são anônimas e vinculadas apenas a um identificador aleatório salvo no seu navegador.</p>
      <p>Para limitar spam e abusos, guardamos por poucos dias um código temporário derivado do endereço de rede do visitante. Ele não permite identificar você e não é usado para outra finalidade.</p>
      <p>As fontes do site são carregadas do Google Fonts, que pode receber o endereço de rede do visitante nessa requisição.</p>
      <p>Para remover um comentário, entre em contato com a equipe do site.</p>
    </div>
  );
}
