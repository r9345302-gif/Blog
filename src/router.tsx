import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

// Publicação em subpasta (ex.: GitHub Pages em /Blog/): o roteador precisa conhecer o prefixo.
// Na raiz do domínio o valor é "" e nada muda.
const basepath = import.meta.env.BASE_URL.replace(/\/+$/, "");

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(basepath ? { basepath } : {}),
  });

  // Sends loader-fetched query data to the browser so the first render matches the server.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });

  return router;
};
