import { useState } from "react";
import { ArrowLeft, ShieldAlert, UserRoundCheck, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = {
  onBack: () => void;
  onExistingCustomer: (phone: string) => void;
  onNewCustomerWithReferral: (phone: string, referralPhone: string) => void;
};

type Screen = "phone" | "referral" | "blocked";

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const isPhone = (value: string) => /^\d{10,11}$/.test(onlyDigits(value));

export function OnlinePhoneEntryPanel({ onBack, onExistingCustomer, onNewCustomerWithReferral }: Props) {
  const [screen, setScreen] = useState<Screen>("phone");
  const [phone, setPhone] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
  const [message, setMessage] = useState("");
  const checkPhone = trpc.onlineSupport.entryStartByPhone.useMutation();

  const reset = () => {
    setScreen("phone");
    setPhone("");
    setReferralPhone("");
    setMessage("");
  };

  const continueWithPhone = async () => {
    const normalizedPhone = onlyDigits(phone);
    if (!isPhone(normalizedPhone)) {
      setMessage("Informe um telefone válido com DDD.");
      return;
    }
    try {
      setMessage("");
      const result = await checkPhone.mutateAsync({ phone: normalizedPhone });
      if (result.status === "blocked") {
        setScreen("blocked");
        setMessage("Este cadastro não possui acesso ao sistema.");
        return;
      }
      if (result.status === "existing") {
        onExistingCustomer(normalizedPhone);
        return;
      }
      setPhone(normalizedPhone);
      setScreen("referral");
    } catch {
      setMessage("Não foi possível verificar o telefone. Tente novamente.");
    }
  };

  const continueWithReferral = async () => {
    const normalizedReferral = onlyDigits(referralPhone);
    if (!isPhone(normalizedReferral)) {
      setMessage("Informe um número de indicação válido com DDD.");
      return;
    }
    if (normalizedReferral === onlyDigits(phone)) {
      setMessage("O número de indicação não pode ser o mesmo telefone do novo cliente.");
      return;
    }
    try {
      setMessage("");
      const result = await checkPhone.mutateAsync({ phone: onlyDigits(phone), referralPhone: normalizedReferral });
      if (result.status !== "referral_valid") {
        setScreen("blocked");
        setMessage("Sem indicação válida, não é possível acessar o sistema.");
        return;
      }
      onNewCustomerWithReferral(result.phone, result.referralPhone);
    } catch {
      setScreen("blocked");
      setMessage("Sem indicação válida, não é possível acessar o sistema.");
    }
  };

  const loading = checkPhone.isPending;
  if (screen === "blocked") {
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button onClick={onBack} style={backStyle}><ArrowLeft size={15} /> Voltar</button>
      <div style={blockedCard}>
        <div style={blockedIcon}><ShieldAlert size={25} /></div>
        <h3 style={titleStyle}>Acesso não liberado</h3>
        <p style={textStyle}>{message || "Sem indicação válida, não é possível acessar o sistema."}</p>
        <p style={hintStyle}>Informe um número de indicação cadastrado e ativo.</p>
        <button onClick={reset} style={primaryButton}>Informar outra indicação</button>
      </div>
    </div>;
  }

  const referral = screen === "referral";
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <button onClick={referral ? reset : onBack} style={backStyle}><ArrowLeft size={15} /> Voltar</button>
    <div style={cardStyle}>
      <div style={iconWrap}>{referral ? <UsersRound size={26} /> : <UserRoundCheck size={26} />}</div>
      <h3 style={titleStyle}>{referral ? "Quem indicou você?" : "Informe seu telefone"}</h3>
      <p style={textStyle}>{referral ? "Para iniciar um novo cadastro, informe o telefone com DDD de quem indicou você." : "Digite seu telefone com DDD para continuar."}</p>
      <input
        value={referral ? referralPhone : phone}
        onChange={(event) => { referral ? setReferralPhone(event.target.value) : setPhone(event.target.value); setMessage(""); }}
        onKeyDown={(event) => { if (event.key === "Enter") referral ? continueWithReferral() : continueWithPhone(); }}
        placeholder="(00) 00000-0000"
        inputMode="numeric"
        autoComplete="tel"
        style={inputStyle}
      />
      {message && <p style={errorStyle}>{message}</p>}
      <button disabled={loading} onClick={referral ? continueWithReferral : continueWithPhone} style={{ ...primaryButton, opacity: loading ? .65 : 1 }}>
        {loading ? "Verificando..." : "Continuar"}
      </button>
    </div>
  </div>;
}

const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.11)", borderRadius: 14, padding: 18, textAlign: "center" };
const blockedCard: React.CSSProperties = { ...cardStyle, border: "1px solid rgba(248,113,113,.42)", background: "rgba(127,29,29,.16)" };
const iconWrap: React.CSSProperties = { margin: "0 auto 10px", width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#c4b5fd", background: "rgba(124,58,237,.2)" };
const blockedIcon: React.CSSProperties = { ...iconWrap, color: "#fca5a5", background: "rgba(239,68,68,.18)" };
const titleStyle: React.CSSProperties = { color: "#fff", fontSize: 18, margin: "4px 0 8px" };
const textStyle: React.CSSProperties = { color: "rgba(255,255,255,.68)", fontSize: 13, lineHeight: 1.55, margin: "0 0 14px" };
const hintStyle: React.CSSProperties = { color: "#fecaca", fontSize: 12, lineHeight: 1.45, margin: "0 0 12px" };
const errorStyle: React.CSSProperties = { color: "#fca5a5", fontSize: 12, textAlign: "left", margin: "8px 0 0" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 44, borderRadius: 10, border: "1px solid rgba(255,255,255,.16)", background: "rgba(0,0,0,.26)", color: "#fff", padding: "0 12px", outline: "none", fontSize: 15 };
const primaryButton: React.CSSProperties = { width: "100%", minHeight: 43, marginTop: 12, border: 0, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff", fontWeight: 800, cursor: "pointer" };
const backStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,.65)", background: "transparent", border: 0, cursor: "pointer", fontSize: 12, padding: 0 };
