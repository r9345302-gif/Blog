import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — Pauta" },
      { name: "description", content: "Como coletamos e usamos dados de navegação." },
      { property: "og:title", content: "Política de privacidade — Pauta" },
      { property: "og:description", content: "Como coletamos e usamos dados de navegação." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="prose-article mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-sans text-5xl font-black">Privacidade</h1>
      <p>Registramos de forma anônima quais páginas são visitadas e por quanto tempo, para entender quais assuntos interessam mais aos leitores. Não usamos esses dados para identificar você.</p>
      <p>Ao comentar, o nome informado e o texto ficam públicos. Avaliações são anônimas e vinculadas apenas a um identificador aleatório salvo no seu navegador.</p>
      <p>Para remover um comentário, entre em contato com a equipe do site.</p>
    </div>
  );
}
