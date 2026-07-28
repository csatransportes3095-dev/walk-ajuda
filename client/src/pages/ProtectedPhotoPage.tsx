import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Photo = {
  id: number;
  title: string;
  message: string;
  imageUrl: string;
  imageKey: string;
  isActive: number;
  sortOrder: number;
  createdAt: Date;
};

function PhotoCard({ photo, phone, pin, onAccessGranted, accessGranted, expanded, onExpand, onCloseExpand }: {
  photo: Photo;
  phone: string;
  pin: string;
  onAccessGranted: (photoId: number) => void;
  accessGranted: boolean;
  expanded: boolean;
  onExpand: () => void;
  onCloseExpand: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkPinMut = trpc.customerPin.check.useMutation();
  const logAccessMut = trpc.protectedPhotos.logAccess.useMutation();

  const digits = phone.replace(/\D/g, "");
  const canSubmit = digits.length >= 10 && pin.length === 4 && !checking;

  const handleCheck = async () => {
    if (digits.length < 10) { toast.error("Digite seu telefone com DDD"); return; }
    if (pin.length !== 4) { toast.error("Digite a senha de 4 dígitos"); return; }
    setChecking(true);
    setError(null);
    try {
      const result = await checkPinMut.mutateAsync({ phone: digits, pin });
      if (result.success) {
        onAccessGranted(photo.id);
        logAccessMut.mutate({ phone: digits, photoId: photo.id });
        toast.success("Acesso liberado!");
      } else if (result.blocked) {
        setError("🚫 Acesso bloqueado por excesso de tentativas. Contate o suporte.");
      } else if (result.error === "wrong") {
        const att = (result as { attempts?: number }).attempts ?? 1;
        setError(`❌ Senha incorreta. Tentativa ${att}/3.`);
      } else {
        setError("❌ Número não encontrado. Faça seu cadastro primeiro.");
      }
    } catch {
      toast.error("Erro ao verificar. Tente novamente.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      {/* Lightbox */}
      {expanded && accessGranted && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={onCloseExpand}
          onContextMenu={e => e.preventDefault()}
        >
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }} onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
            <img
              src={photo.imageUrl}
              alt=""
              draggable={false}
              onContextMenu={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
              style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: 12, display: "block", WebkitUserSelect: "none", userSelect: "none", pointerEvents: "none" }}
            />
            <div style={{ position: "absolute", inset: 0, zIndex: 1 }} onContextMenu={e => e.preventDefault()} />
          </div>
          <button onClick={onCloseExpand} style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        </div>
      )}

      <div style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        {accessGranted ? (
          <div style={{ position: "relative" }}>
            <img
              src={photo.imageUrl}
              alt=""
              draggable={false}
              onContextMenu={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
              style={{ width: "100%", objectFit: "contain", maxHeight: "70vh", display: "block", WebkitUserSelect: "none", userSelect: "none", pointerEvents: "none" }}
            />
            <div
              style={{ position: "absolute", inset: 0, cursor: "zoom-in", zIndex: 2 }}
              onClick={onExpand}
              onContextMenu={e => e.preventDefault()}
              onDragStart={e => e.preventDefault()}
            />
            <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.1)", borderTop: "1px solid rgba(34,197,94,0.2)", textAlign: "center" }}>
              <p style={{ color: "#4ade80", fontSize: 13, margin: 0 }}>✅ Acesso liberado — toque na imagem para ampliar</p>
            </div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <img
              src={photo.imageUrl}
              alt=""
              style={{ width: "100%", objectFit: "contain", maxHeight: "60vh", filter: "blur(20px) brightness(0.35)", display: "block", userSelect: "none", pointerEvents: "none" }}
            />
            {/* Overlay simples com cadeado — sem repetir formulário */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 16, padding: "16px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 36 }}>🔒</div>
                <p style={{ color: "#c4b5fd", fontSize: 13, margin: "8px 0 0", fontWeight: 600 }}>Conteúdo bloqueado</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function ProtectedPhotoPage() {
  const { data: photos, isLoading } = trpc.protectedPhotos.getActive.useQuery();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [accessGrantedIds, setAccessGrantedIds] = useState<Set<number>>(new Set());
  const [expandedPhotoId, setExpandedPhotoId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkPinMut = trpc.customerPin.check.useMutation();
  const logAccessMut = trpc.protectedPhotos.logAccess.useMutation();

  const handleAccessGranted = (photoId: number) => {
    setAccessGrantedIds(prev => { const next = new Set(Array.from(prev)); next.add(photoId); return next; });
  };

  const handleUnlockAll = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setAuthError("Digite seu telefone com DDD"); return; }
    if (pin.length !== 4) { setAuthError("Digite a senha de 4 dígitos"); return; }
    setChecking(true);
    setAuthError(null);
    try {
      const result = await checkPinMut.mutateAsync({ phone: digits, pin });
      if (result.success) {
        // Desbloquear todas as fotos de uma vez
        const ids = (photos || []).map(p => p.id);
        setAccessGrantedIds(new Set(ids));
        ids.forEach(id => logAccessMut.mutate({ phone: digits, photoId: id }));
      } else if (result.blocked) {
        setAuthError("🚫 Acesso bloqueado por excesso de tentativas. Contate o suporte.");
      } else if (result.error === "wrong") {
        const att = (result as { attempts?: number }).attempts ?? 1;
        setAuthError(`❌ Senha incorreta. Tentativa ${att}/3.`);
      } else {
        setAuthError("❌ Número não encontrado. Faça seu cadastro primeiro.");
      }
    } catch {
      setAuthError("Erro ao verificar. Tente novamente.");
    } finally {
      setChecking(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "#6b7280", textAlign: "center" }}>Nenhum conteúdo disponível no momento.</p>
      </div>
    );
  }

  return (
    <div className="protected-photo-page" style={{ minHeight: "100vh", background: "#0a0a1a", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }} className="space-y-6">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, background: "rgba(124,58,237,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔒</div>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, margin: 0 }}>Conteúdo Exclusivo</p>
            <p style={{ color: "rgba(196,181,253,0.7)", fontSize: 12, margin: 0 }}>Para clientes cadastrados</p>
          </div>
        </div>

        {/* Campos de autenticação compartilhados */}
        <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 16, padding: 16 }} className="space-y-3">
          <p style={{ color: "#c4b5fd", fontSize: 13, fontWeight: 600, margin: 0 }}>🔑 Insira seus dados para desbloquear</p>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setAuthError(null); }}
            placeholder="Telefone com DDD"
            style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(124,58,237,0.5)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setAuthError(null); }}
            onKeyDown={e => { if (e.key === "Enter") handleUnlockAll(); }}
            placeholder="Senha (4 dígitos)"
            style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(124,58,237,0.5)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", letterSpacing: "0.3em" }}
          />
          <p style={{ color: "rgba(196,181,253,0.5)", fontSize: 11, margin: 0 }}>
            💡 A senha é a mesma que você usa em "Acompanhe seu Pedido"
          </p>
          {authError && (
            <p style={{ color: "#f87171", fontSize: 13, fontWeight: 600, margin: 0 }}>{authError}</p>
          )}
          <button
            onClick={handleUnlockAll}
            disabled={checking || phone.replace(/\D/g, "").length < 10 || pin.length !== 4}
            style={{ width: "100%", padding: "12px 0", background: (checking || phone.replace(/\D/g, "").length < 10 || pin.length !== 4) ? "rgba(124,58,237,0.3)" : "#7c3aed", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: (checking || phone.replace(/\D/g, "").length < 10 || pin.length !== 4) ? "not-allowed" : "pointer" }}
          >
            {checking ? "Verificando..." : "🔓 Desbloquear"}
          </button>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: 0, textAlign: "center" }}>
            Não tem cadastro?{" "}
            <a href="/" style={{ color: "#a78bfa", textDecoration: "underline" }}>Clique aqui para se cadastrar</a>
          </p>
        </div>

        {/* Fotos em coluna */}
        {photos.map(photo => (
          <div key={photo.id}>
            <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{photo.title}</p>
            <PhotoCard
              photo={photo}
              phone={phone}
              pin={pin}
              onAccessGranted={handleAccessGranted}
              accessGranted={accessGrantedIds.has(photo.id)}
              expanded={expandedPhotoId === photo.id}
              onExpand={() => setExpandedPhotoId(photo.id)}
              onCloseExpand={() => setExpandedPhotoId(null)}
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print { body { display: none !important; } }
        .protected-photo-page { -webkit-user-select: none; user-select: none; }
        .protected-photo-page img { -webkit-user-drag: none; }
      `}</style>
    </div>
  );
}
