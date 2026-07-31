import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Eye, EyeOff, Phone, Lock, CreditCard, ArrowRight, TrendingDown, Shield } from "lucide-react";

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
      setTimeout(() => utils.auth.me.refetch(), 200);
    },
    onError: (e) => toast.error(e.message),
  });

  const registerMutation = trpc.cartoes.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada!");
      setTimeout(() => utils.auth.me.refetch(), 200);
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
      display: "flex",
      flexDirection: "column",
      background: "#6750A4",
      fontFamily: "'Roboto', sans-serif",
      overflowX: "hidden",
    }}>
      {/* TOP SECTION — Hero */}
      <div style={{
        flex: "0 0 auto",
        padding: "48px 24px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}>
        {/* App Icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          background: "rgba(255,255,255,0.2)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}>
          <CreditCard size={36} color="#fff" />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 8px", letterSpacing: -0.5 }}>
          Meus Cartões
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", margin: 0 }}>
          Controle total dos seus gastos
        </p>
      </div>

      {/* MIDDLE SECTION — Feature pills */}
      <div style={{
        flex: "0 0 auto",
        padding: "0 24px 24px",
        display: "flex",
        gap: 10,
        justifyContent: "center",
        flexWrap: "wrap",
      }}>
        {[
          { icon: <TrendingDown size={14} />, label: "Controle de gastos" },
          { icon: <Shield size={14} />, label: "Alertas de vencimento" },
          { icon: <CreditCard size={14} />, label: "Múltiplos cartões" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 50,
            padding: "6px 14px",
            color: "#fff",
            fontSize: 12,
            fontWeight: 500,
          }}>
            {item.icon}
            {item.label}
          </div>
        ))}
      </div>

      {/* BOTTOM SECTION — Form Card */}
      <div style={{
        flex: "1 1 auto",
        background: "#FFFBFE",
        borderRadius: "28px 28px 0 0",
        padding: "28px 24px",
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 24px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 420,
      }}>
        {/* Tab Switcher */}
        <div style={{
          display: "flex",
          background: "#F4EFF4",
          borderRadius: 50,
          padding: 4,
          marginBottom: 24,
        }}>
          {(["login", "register"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 50,
                border: "none",
                background: tab === t ? "#6750A4" : "transparent",
                color: tab === t ? "#fff" : "#79747E",
                fontSize: 14,
                fontWeight: tab === t ? 600 : 500,
                cursor: "pointer",
                transition: "all 200ms",
                fontFamily: "'Roboto', sans-serif",
              }}
            >
              {t === "login" ? "Entrar" : "Criar Conta"}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {tab === "register" && (
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6750A4", display: "block", marginBottom: 6, letterSpacing: 0.4 }}>
                SEU NOME
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Como quer ser chamado"
                autoComplete="name"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = "#6750A4")}
                onBlur={e => (e.target.style.borderColor = "#E7E0EC")}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6750A4", display: "block", marginBottom: 6, letterSpacing: 0.4 }}>
              TELEFONE
            </label>
            <div style={{ position: "relative" }}>
              <Phone size={18} color="#79747E" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                style={{ ...inputStyle, paddingLeft: 44 }}
                onFocus={e => (e.target.style.borderColor = "#6750A4")}
                onBlur={e => (e.target.style.borderColor = "#E7E0EC")}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6750A4", display: "block", marginBottom: 6, letterSpacing: 0.4 }}>
              SENHA
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={18} color="#79747E" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                style={{ ...inputStyle, paddingLeft: 44, paddingRight: 48 }}
                onFocus={e => (e.target.style.borderColor = "#6750A4")}
                onBlur={e => (e.target.style.borderColor = "#E7E0EC")}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: 4, color: "#79747E",
                }}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6750A4", display: "block", marginBottom: 6, letterSpacing: 0.4 }}>
                CONFIRMAR SENHA
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={18} color="#79747E" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  type={showPass ? "text" : "password"}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  style={{ ...inputStyle, paddingLeft: 44 }}
                  onFocus={e => (e.target.style.borderColor = "#6750A4")}
                  onBlur={e => (e.target.style.borderColor = "#E7E0EC")}
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isPending}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 50,
            border: "none",
            background: isPending ? "#CAC4D0" : "#6750A4",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            fontFamily: "'Roboto', sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 20,
            boxShadow: isPending ? "none" : "0 4px 16px rgba(103,80,164,0.35)",
            transition: "all 200ms",
          }}
        >
          {isPending ? "Aguarde..." : (
            <>
              {tab === "login" ? "Entrar" : "Criar Conta"}
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p style={{ textAlign: "center", fontSize: 12, color: "#79747E", marginTop: 16 }}>
          Cada número de telefone é uma conta independente
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  padding: "0 16px",
  borderRadius: 12,
  border: "2px solid #E7E0EC",
  background: "#F4EFF4",
  fontSize: 16,
  color: "#1C1B1F",
  outline: "none",
  fontFamily: "'Roboto', sans-serif",
  boxSizing: "border-box",
  transition: "border-color 200ms",
};
