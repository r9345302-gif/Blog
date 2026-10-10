import { useState } from "react";
import { BarChart3, FileText, FolderKanban, MessageSquare, Settings, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NichesTab } from "./NichesTab";
import { PostsTab } from "./PostsTab";
import { CommentsTab } from "./CommentsTab";
import { StatsTab } from "./StatsTab";
import { SettingsTab } from "./SettingsTab";

const tabs = [
  { id: "niches", label: "Nichos", icon: FolderKanban },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "comments", label: "Comentários", icon: MessageSquare },
  { id: "stats", label: "Estatísticas", icon: BarChart3 },
  { id: "settings", label: "Configurações gerais", icon: Settings },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AdminApp({ email }: { email: string }) {
  const [tab, setTab] = useState<TabId>("niches");
  return (
    <div className="flex min-h-screen bg-secondary">
      <aside className="flex w-60 shrink-0 flex-col bg-ink p-4 text-ink-foreground">
        <a href="/" className="mb-8 text-2xl font-black">painel<span className="text-primary">.</span></a>
        <nav className="space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold ${tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-ink-foreground/10"}`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-xs text-ink-muted">
          <p className="truncate">{email}</p>
          <button onClick={() => supabase!.auth.signOut()} className="mt-2 flex items-center gap-2 hover:text-primary">
            <LogOut className="h-3 w-3" /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        {tab === "niches" && <NichesTab />}
        {tab === "posts" && <PostsTab />}
        {tab === "comments" && <CommentsTab />}
        {tab === "stats" && <StatsTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}

export function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-black">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-10 w-full border border-input bg-background px-3 text-sm outline-none focus:border-primary";
export const areaCls = "w-full border border-input bg-background p-3 text-sm outline-none focus:border-primary";
export const btnCls = "inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
export const btnGhost = "inline-flex items-center gap-2 border border-input px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50";
