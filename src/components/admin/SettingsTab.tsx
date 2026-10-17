import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { defaultSettings } from "@/lib/sample-data";
import type { HomeBlock, SiteSettings } from "@/lib/types";
import { Field, Panel, areaCls, btnCls, inputCls } from "./AdminApp";
import { MfaPanel } from "./MfaPanel";

const db = () => supabase!;
const blockNames: Record<HomeBlock["type"], string> = {
  featured: "Grade de destaques",
  latest: "Últimas publicações + barra lateral",
  niches: "Seções por nicho",
};

export function SettingsTab() {
  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const [s, k] = await Promise.all([db().from("site_settings").select("*").eq("id", 1).single(), db().from("secret_settings").select("*").eq("id", 1).single()]);
      return { site: { ...defaultSettings, ...s.data } as SiteSettings, secret: k.data as { gemini_api_key: string | null; gemini_model: string } };
    },
  });
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSite(data.site);
    setApiKey(data.secret?.gemini_api_key ?? "");
    setModel(data.secret?.gemini_model ?? "gemini-2.5-flash");
  }, [data]);

  if (!site) return null;
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setSite({ ...site, [k]: v });

  async function saveSite() {
    const { error } = await db()
      .from("site_settings")
      .update({ site_name: site!.site_name, site_tagline: site!.site_tagline, about: site!.about, language: site!.language, region: site!.region, site_url: site!.site_url, home_layout: site!.home_layout, post_structure: site!.post_structure, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas. O site público é atualizado automaticamente em até ~20 minutos.");
  }
  async function saveKey() {
    const { error } = await db().from("secret_settings").update({ gemini_api_key: apiKey.trim() || null, gemini_model: model.trim(), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success("Chave salva");
  }
  async function testKey() {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": apiKey.trim() } });
    if (r.ok) toast.success("Chave válida e modelo disponível!");
    else toast.error(`Falhou (${r.status}): ${(await r.text()).slice(0, 160)}`);
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...site!.home_layout];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
    set("home_layout", arr);
  }
  function patchBlock(i: number, patch: Partial<HomeBlock>) {
    set("home_layout", site!.home_layout.map((b, k) => (k === i ? ({ ...b, ...patch } as HomeBlock) : b)));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Configurações gerais</h1>

      <Panel title="Inteligência artificial (Gemini)" actions={<div className="flex gap-2"><button className="text-sm font-semibold text-primary" onClick={testKey}>Testar</button><button className={btnCls} onClick={saveKey}>Salvar chave</button></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Chave de API do Gemini" hint="Obtenha em aistudio.google.com → Get API key. Fica visível só para administradores.">
            <div className="flex gap-2">
              <input type={showKey ? "text" : "password"} className={inputCls} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." autoComplete="off" />
              <button className="text-xs font-semibold" onClick={() => setShowKey(!showKey)}>{showKey ? "Ocultar" : "Mostrar"}</button>
            </div>
          </Field>
          <Field label="Modelo" hint="Ex.: gemini-2.5-flash (rápido/barato) ou gemini-2.5-pro (melhor qualidade)">
            <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Site" actions={<button className={btnCls} onClick={saveSite}>Salvar</button>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do site"><input className={inputCls} value={site.site_name} onChange={(e) => set("site_name", e.target.value)} /></Field>
          <Field label="Slogan"><input className={inputCls} value={site.site_tagline} onChange={(e) => set("site_tagline", e.target.value)} /></Field>
          <Field label="Idioma dos blogs" hint="Ex.: pt-BR, en-US, es-ES"><input className={inputCls} value={site.language} onChange={(e) => set("language", e.target.value)} /></Field>
          <Field label="Região" hint="Ex.: BR, PT, US"><input className={inputCls} value={site.region} onChange={(e) => set("region", e.target.value)} /></Field>
          <Field label="Endereço do site" hint="Ex.: https://meublog.com — usado no Google e no sitemap"><input className={inputCls} value={site.site_url} onChange={(e) => set("site_url", e.target.value)} /></Field>
          <Field label="Sobre nós"><textarea className={areaCls} rows={3} value={site.about} onChange={(e) => set("about", e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="Estrutura padrão de todos os posts" hint="Cada nicho pode substituir esta estrutura nas suas configurações.">
              <textarea className={areaCls} rows={7} value={site.post_structure} onChange={(e) => set("post_structure", e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Estrutura da página principal" actions={<button className={btnCls} onClick={saveSite}>Salvar</button>}>
        <ul className="space-y-2">
          {site.home_layout.map((b, i) => (
            <li key={b.type} className="flex flex-wrap items-center gap-3 border p-3">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={b.enabled} onChange={(e) => patchBlock(i, { enabled: e.target.checked })} />
                {blockNames[b.type]}
              </label>
              {b.type === "latest" && (
                <div className="ml-auto flex gap-2">
                  <input className={`${inputCls} w-48`} value={b.title ?? ""} onChange={(e) => patchBlock(i, { title: e.target.value })} placeholder="Título da lista" />
                  <input className={`${inputCls} w-48`} value={b.sidebar_title ?? ""} onChange={(e) => patchBlock(i, { sidebar_title: e.target.value })} placeholder="Título da barra lateral" />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <MfaPanel />
    </div>
  );
}
