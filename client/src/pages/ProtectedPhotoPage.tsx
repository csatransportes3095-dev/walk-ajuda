import { useState } from "react";
import { trpc } from "@/lib/trpc";

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

export default function ProtectedPhotoPage() {
  const { data: photos, isLoading } = trpc.protectedPhotos.getActive.useQuery();
  const [expandedPhotoId, setExpandedPhotoId] = useState<number | null>(null);
  const cpToken = typeof window !== "undefined" ? localStorage.getItem("cp_token") || "" : "";
  const sessionQuery = trpc.customerPassword.checkSession.useQuery(
    { token: cpToken },
    { enabled: !!cpToken, retry: false, staleTime: 0 },
  );
  const logAccessMut = trpc.protectedPhotos.logAccess.useMutation();

  const openPhoto = (photoId: number) => {
    const phone = sessionQuery.data?.phone || localStorage.getItem("walk_client_phone") || "";
    if (phone) logAccessMut.mutate({ phone, photoId });
    setExpandedPhotoId(photoId);
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

  const expanded = photos.find((photo) => photo.id === expandedPhotoId) || null;

  return (
    <div
      className="protected-photo-page"
      style={{ minHeight: "100vh", background: "#0a0a1a", padding: "24px 16px" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {expanded && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setExpandedPhotoId(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={expanded.imageUrl}
              alt={expanded.title || "Conteúdo exclusivo"}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: 12, display: "block", WebkitUserSelect: "none", userSelect: "none", pointerEvents: "none" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setExpandedPhotoId(null)}
            style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
            aria-label="Fechar imagem"
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto" }} className="space-y-6">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, background: "rgba(124,58,237,0.3)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔒</div>
          <div>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, margin: 0 }}>Conteúdo Exclusivo</p>
            <p style={{ color: "rgba(196,181,253,0.7)", fontSize: 12, margin: 0 }}>Acesso validado pelo cadastro do cliente</p>
          </div>
        </div>

        {photos.map((photo: Photo) => (
          <div key={photo.id}>
            <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{photo.title}</p>
            <div style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <div style={{ position: "relative" }}>
                <img
                  src={photo.imageUrl}
                  alt={photo.title || "Conteúdo exclusivo"}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  style={{ width: "100%", objectFit: "contain", maxHeight: "70vh", display: "block", WebkitUserSelect: "none", userSelect: "none", pointerEvents: "none" }}
                />
                <button
                  type="button"
                  aria-label={`Ampliar ${photo.title || "imagem"}`}
                  onClick={() => openPhoto(photo.id)}
                  style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "transparent", cursor: "zoom-in", zIndex: 2 }}
                />
              </div>
              {(photo.message || photo.title) && (
                <div style={{ padding: "12px 16px", background: "rgba(124,58,237,0.08)", borderTop: "1px solid rgba(124,58,237,0.2)" }}>
                  {photo.message && <p style={{ color: "#c4b5fd", fontSize: 13, margin: 0 }}>{photo.message}</p>}
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: photo.message ? "6px 0 0" : 0, textAlign: "center" }}>Toque na imagem para ampliar</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print { body { display: none !important; } }
        .protected-photo-page { -webkit-user-select: none; user-select: none; }
      `}</style>
    </div>
  );
}
