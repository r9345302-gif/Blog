import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AdminApp } from "@/components/admin/AdminApp";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Área restrita." },
      { property: "og:title", content: "Painel" },
      { property: "og:description", content: "Área restrita." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [needsMfa, setNeedsMfa] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return setReady(true);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Se a conta tem verificação em duas etapas, a sessão só vale depois de digitar o código do app autenticador.
  useEffect(() => {
    if (!supabase || !session) return setNeedsMfa(null);
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setNeedsMfa(!!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2"));
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return setIsAdmin(null);
    supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" }).then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (!ready) return null;
  if (!supabase)
    return (
      <Center>
        <h1 className="text-2xl font-black">Banco de dados não conectado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Conecte o Supabase e rode o arquivo supabase/schema.sql para usar o painel. Veja o guia em DEPLOY.md.</p>
      </Center>
    );
  if (!session) return <Login />;
  if (needsMfa === null) return <Center>Verificando acesso...</Center>;
  if (needsMfa) return <MfaChallenge onDone={() => setNeedsMfa(false)} />;
  if (isAdmin === null) return <Center>Verificando acesso...</Center>;
  if (!isAdmin)
    return (
      <Center>
        <p>Esta conta não tem acesso.</p>
        <button className="mt-4 text-sm text-primary underline" onClick={() => supabase!.auth.signOut()}>Sair</button>
      </Center>
    );
  return <AdminApp email={session.user.email ?? ""} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md text-center">{children}</div></div>;
}

function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Center>
      <form
        className="w-80 space-y-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const { data: listed } = await supabase!.auth.mfa.listFactors();
          const factor = listed?.totp?.[0];
          if (!factor) {
            setBusy(false);
            onDone();
            return;
          }
          const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
          setBusy(false);
          if (error) {
            setError("Código incorreto ou expirado.");
            return;
          }
          onDone();
        }}
      >
        <h1 className="text-2xl font-black">Verificação em duas etapas</h1>
        <p className="text-sm text-muted-foreground">Digite o código de 6 dígitos do seu app autenticador.</p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="h-10 w-full border border-input bg-card px-3 tracking-widest"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button disabled={busy || code.length !== 6} className="h-10 w-full bg-primary font-bold text-primary-foreground disabled:opacity-50">
          Confirmar
        </button>
        <button type="button" className="text-sm text-primary underline" onClick={() => supabase!.auth.signOut()}>
          Sair
        </button>
      </form>
    </Center>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <Center>
      <form
        className="w-80 space-y-3 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase!.auth.signInWithPassword({ email, password });
          if (error) setError("E-mail ou senha incorretos.");
        }}
      >
        <h1 className="text-2xl font-black">Entrar</h1>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="h-10 w-full border border-input bg-card px-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" className="h-10 w-full border border-input bg-card px-3" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button className="h-10 w-full bg-primary font-bold text-primary-foreground">Entrar</button>
      </form>
    </Center>
  );
}
