import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/api";

export const Route = createFileRoute("/sobre")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(settingsQuery()),
  head: () => ({
    meta: [
      { title: "Sobre nós — Pauta" },
      { name: "description", content: "Conheça a proposta e a equipe por trás da Pauta." },
      { property: "og:title", content: "Sobre nós — Pauta" },
      { property: "og:description", content: "Conheça a proposta e a equipe por trás da Pauta." },
    ],
  }),
  component: About,
});

function About() {
  const { data } = useSuspenseQuery(settingsQuery());
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-5xl font-black">Sobre nós</h1>
      <p className="mt-6 font-serif text-xl leading-relaxed">{data.about}</p>
    </div>
  );
}
