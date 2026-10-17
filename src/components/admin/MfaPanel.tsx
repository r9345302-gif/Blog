import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Panel, btnCls, btnGhost, inputCls } from "./AdminApp";

const db = () => supabase!;

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

/** Verificação em duas etapas (app autenticador: Google Authenticator, Authy, 1Password...). */
export function MfaPanel() {
  const [active, setActive] = useState<{ id: string } | null | undefined>(undefined); // undefined = carregando
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await db().auth.mfa.listFactors();
    const verified = data?.totp?.[0];
    setActive(verified ? { id: verified.id } : null);
  }
  useEffect(() => {
    void load();
  }, []);

  async function start() {
    setBusy(true);
    // Cadastros iniciados e nunca confirmados atrapalham um novo: remove antes de começar.
    const { data: listed } = await db().auth.mfa.listFactors();
    for (const f of (listed?.all ?? []).filter((x) => x.status !== "verified")) await db().auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await db().auth.mfa.enroll({ factorType: "totp", friendlyName: "Painel do blog" });
    setBusy(false);
    if (error || !data) {
      toast.error(`Não foi possível iniciar: ${error?.message ?? "erro desconhecido"}`);
      return;
    }
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enroll) return;
    setBusy(true);
    const { error } = await db().auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error("Código incorreto. Confira o app e tente de novo.");
      return;
    }
    toast.success("Verificação em duas etapas ativada.");
    setEnroll(null);
    setCode("");
    void load();
  }

  async function disable() {
    if (!active) return;
    if (!window.confirm("Desativar a verificação em duas etapas? A conta volta a depender só da senha.")) return;
    const { error } = await db().auth.mfa.unenroll({ factorId: active.id });
    if (error) {
      toast.error(`Não foi possível desativar: ${error.message}`);
      return;
    }
    toast.success("Verificação em duas etapas desativada.");
    void load();
  }

  return (
    <Panel title="Segurança da conta">
      {active === undefined ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : enroll ? (
        <div className="space-y-4 text-sm">
          <p>
            1. Abra o app autenticador e escaneie o QR code (ou digite a chave manualmente).
            <br />
            2. Digite o código de 6 dígitos que o app mostrar.
          </p>
          <img src={enroll.qr} alt="QR code para o app autenticador" className="h-44 w-44 border bg-white p-2" />
          <p className="break-all">
            Chave manual: <code className="font-mono">{enroll.secret}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputCls} w-40 tracking-widest`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
            <button className={btnCls} disabled={busy || code.length !== 6} onClick={verify}>
              Confirmar e ativar
            </button>
            <button
              className={btnGhost}
              onClick={() => {
                setEnroll(null);
                setCode("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : active ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-green-700">Verificação em duas etapas ATIVADA.</p>
          <p className="text-muted-foreground">Ao entrar no painel, além da senha será pedido o código do app autenticador.</p>
          <button className={btnGhost} onClick={disable}>
            Desativar
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            Proteja o painel com um segundo passo: além da senha, o login passa a pedir um código de 6 dígitos de um app autenticador no seu celular.
          </p>
          <button className={btnCls} disabled={busy} onClick={start}>
            Ativar verificação em duas etapas
          </button>
        </div>
      )}
    </Panel>
  );
}
