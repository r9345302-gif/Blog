// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// STATIC_EXPORT=1 (used by the GitHub Pages workflow) prerenders every reachable page to HTML.
const isStatic = !!process.env['STATIC_EXPORT'];

// SITE_BASE (ex.: "/Blog/") é necessário quando o repositório NÃO é
// "usuario.github.io" nem usa domínio próprio — o Pages publica em subpasta.
const siteBase = process.env['SITE_BASE'] || "/";

export default defineConfig({
  vite: isStatic && siteBase !== "/" ? { base: siteBase } : {},
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isStatic
      ? {
          spa: { enabled: true },
          prerender: { enabled: true, crawlLinks: true, failOnError: false },
          pages: [{ path: "/" }, { path: "/arquivo" }, { path: "/sobre" }, { path: "/privacidade" }],
        }
      : {}),
  },
});
