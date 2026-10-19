import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteFooter, SiteHeader } from "@/components/blog/SiteChrome";
import { Toaster } from "@/components/ui/sonner";
import { nichesQuery, settingsQuery } from "@/lib/api";
import { withBase } from "@/lib/utils";
import { loadSite } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">O conteúdo que você procura não existe ou foi movido.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente ou volte ao início.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a href={withBase("")} className="inline-flex items-center justify-center border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

const rootLinks = [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap",
    },
    { rel: "stylesheet", href: appCss },
    { rel: "icon", href: withBase("favicon.ico"), type: "image/x-icon" },
];

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([queryClient.ensureQueryData(settingsQuery()), queryClient.ensureQueryData(nichesQuery())]);
    return { site: await loadSite(queryClient) };
  },
  // Padrões do site; cada página sobrescreve título, descrição e canonical (veja src/lib/seo.ts).
  head: ({ loaderData }) => {
    const site = loaderData?.site;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: site ? `${site.name} — ${site.tagline}` : "Blog" },
        { name: "description", content: site?.about.slice(0, 160) || site?.tagline || "" },
        { property: "og:type", content: "website" },
        ...(site ? [{ property: "og:site_name", content: site.name }] : []),
        { name: "twitter:card", content: "summary" },
      ],
      links: rootLinks,
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isAdmin = useRouterState({ select: (s) => s.location.pathname.startsWith("/admin") });

  return (
    <QueryClientProvider client={queryClient}>
      {isAdmin ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
