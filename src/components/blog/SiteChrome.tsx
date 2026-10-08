import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { nichesQuery, settingsQuery } from "@/lib/api";

function Logo({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <Link to="/" className={`text-3xl font-black tracking-tight ${dark ? "text-ink-foreground" : "text-foreground"}`}>
      {name.toLowerCase()}
      <span className="text-primary">.</span>
    </Link>
  );
}

export function SiteHeader() {
  const { data: settings } = useQuery(settingsQuery());
  const { data: niches = [] } = useQuery(nichesQuery());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Logo name={settings?.site_name ?? "Pauta"} />
        <nav className="hidden flex-1 items-center justify-end gap-6 md:flex">
          {niches.map((n) => (
            <Link
              key={n.id}
              to="/nicho/$slug"
              params={{ slug: n.slug }}
              className="text-sm font-semibold hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {n.name}
            </Link>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/busca", search: { q } });
            }}
            className="relative"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar artigos"
              className="h-9 w-36 border-b border-input bg-transparent pl-7 text-sm outline-none focus:w-48 focus:border-primary transition-all"
            />
            <Search className="absolute left-0 top-2.5 h-4 w-4 text-muted-foreground" />
          </form>
        </nav>
        <button className="ml-auto md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t px-4 py-3 md:hidden">
          {niches.map((n) => (
            <Link key={n.id} to="/nicho/$slug" params={{ slug: n.slug }} className="block py-2 font-semibold" onClick={() => setOpen(false)}>
              {n.name}
            </Link>
          ))}
          <Link to="/busca" search={{ q: "" }} className="block py-2 font-semibold" onClick={() => setOpen(false)}>
            Buscar
          </Link>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { data: settings } = useQuery(settingsQuery());
  const { data: niches = [] } = useQuery(nichesQuery());
  const name = settings?.site_name ?? "Pauta";
  return (
    <footer className="mt-20 bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-3">
        <div>
          <Logo name={name} dark />
          <p className="mt-3 text-sm text-ink-muted">{settings?.site_tagline}</p>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Sobre nós</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{settings?.about}</p>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Assuntos</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {niches.map((n) => (
              <li key={n.id}>
                <Link to="/nicho/$slug" params={{ slug: n.slug }} className="inline-block border border-ink-muted/40 px-3 py-1 text-xs hover:border-primary hover:text-primary">
                  {n.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-muted/20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-ink-muted">
          <span>© {new Date().getFullYear()} {name}</span>
          <nav className="flex flex-wrap gap-5">
            <Link to="/" className="hover:text-primary">Home</Link>
            <Link to="/arquivo" className="hover:text-primary">Todos os artigos</Link>
            <Link to="/sobre" className="hover:text-primary">Sobre</Link>
            <Link to="/privacidade" className="hover:text-primary">Privacidade</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
