import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const utils = trpc.useUtils();

  const loginMutation = trpc.cartoes.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Bem-vindo!");
      utils.cartoes.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const registerMutation = trpc.cartoes.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada!");
      utils.cartoes.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    return v;
  };

  const handleSubmit = () => {
    const rawPhone = phone.replace(/\D/g, "");
    if (rawPhone.length < 10) return toast.error("Telefone inválido");
    if (password.length < 6) return toast.error("Senha mínima: 6 caracteres");
    if (tab === "register") {
      if (!name.trim()) return toast.error("Nome obrigatório");
      if (password !== confirmPassword) return toast.error("Senhas não conferem");
      registerMutation.mutate({ phone: rawPhone, password, name: name.trim() });
    } else {
      loginMutation.mutate({ phone: rawPhone, password });
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d0a1a 40%, #0a0f1a 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 20px",
      fontFamily: "'Inter', 'Roboto', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Orbs de fundo */}
      <div style={{ position: "absolute", top: "-20%", left: "-10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "40%", right: "5%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Card principal */}
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 28,
        padding: "36px 28px",
        boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72,
            borderRadius: 22,
            background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 8px 32px rgba(124,58,237,0.4)",
            fontSize: 32,
          }}>💳</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 6px", letterSpacing: -0.5 }}>
            Meus Cartões
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            Controle total dos seus gastos
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "flex",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: 4,
          marginBottom: 28,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {(["login", "register"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, height: 38, borderRadius: 10, border: "none",
              background: tab === t ? "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)" : "transparent",
              color: tab === t ? "#fff" : "rgba(255,255,255,0.4)",
              fontSize: 13, fontWeight: tab === t ? 700 : 500,
              cursor: "pointer", transition: "all 200ms",
              fontFamily: "inherit",
              boxShadow: tab === t ? "0 4px 16px rgba(124,58,237,0.35)" : "none",
            }}>
              {t === "login" ? "Entrar" : "Criar Conta"}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "register" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Como quer ser chamado" autoComplete="name" style={inputStyle} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Telefone</label>
            <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Senha</label>
            <div style={{ position: "relative" }}>
              <input value={password} onChange={e => setPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="Mínimo 6 caracteres" autoComplete={tab === "login" ? "current-password" : "new-password"} style={{ ...inputStyle, paddingRight: 48 }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 16, padding: 4 }}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          {tab === "register" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Confirmar Senha</label>
              <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showPass ? "text" : "password"} placeholder="Repita a senha" autoComplete="new-password" style={inputStyle} />
            </div>
          )}
        </div>

        {/* Botão */}
        <button onClick={handleSubmit} disabled={isPending} style={{
          width: "100%", height: 52, borderRadius: 14, border: "none",
          background: isPending ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
          color: isPending ? "rgba(255,255,255,0.4)" : "#fff",
          fontSize: 15, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer",
          fontFamily: "inherit", marginTop: 24,
          boxShadow: isPending ? "none" : "0 8px 24px rgba(124,58,237,0.4)",
          transition: "all 200ms", letterSpacing: 0.3,
        }}>
          {isPending ? "Aguarde..." : tab === "login" ? "Entrar →" : "Criar Conta →"}
        </button>

        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 20, marginBottom: 0 }}>
          Cada telefone é uma conta independente
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 50,
  padding: "0 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  fontSize: 15,
  color: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  transition: "border-color 200ms",
};
