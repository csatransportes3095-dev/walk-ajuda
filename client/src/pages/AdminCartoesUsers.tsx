import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Users, KeyRound, Trash2, Plus, Eye, EyeOff, RefreshCw, User, Phone, Calendar, ChevronDown, ChevronUp, X } from "lucide-react";

const GRADIENTS: Record<string, string> = {
  purple: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)",
  blue:   "linear-gradient(135deg, #1565C0 0%, #0288D1 100%)",
  red:    "linear-gradient(135deg, #C62828 0%, #E91E63 100%)",
  green:  "linear-gradient(135deg, #2E7D32 0%, #00897B 100%)",
  orange: "linear-gradient(135deg, #E65100 0%, #F9A825 100%)",
  pink:   "linear-gradient(135deg, #AD1457 0%, #E91E63 100%)",
  teal:   "linear-gradient(135deg, #00695C 0%, #0097A7 100%)",
  indigo: "linear-gradient(135deg, #283593 0%, #5C6BC0 100%)",
  violet: "linear-gradient(135deg, #4527A0 0%, #7B1FA2 100%)",
};

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1a1a2e", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 18, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "#fff", display: "flex" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: any) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={isPassword && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: isPassword ? "10px 40px 10px 14px" : "10px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
        />
        {isPassword && (
          <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex" }}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminCartoesUsers() {
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.cartoes.admin.listUsers.useQuery();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [resetModal, setResetModal] = useState<{ id: number; name: string } | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const onSuccess = () => { utils.cartoes.admin.listUsers.invalidate(); toast.success("Operação realizada!"); };
  const onError = (e: any) => toast.error(e.message || "Erro");

  const resetMutation = trpc.cartoes.admin.resetPassword.useMutation({ onSuccess: () => { onSuccess(); setResetModal(null); setNewPassword(""); }, onError });
  const createMutation = trpc.cartoes.admin.createUser.useMutation({ onSuccess: () => { onSuccess(); setCreateModal(false); setNewName(""); setNewPhone(""); setNewUserPassword(""); }, onError });
  const deleteMutation = trpc.cartoes.admin.deleteUser.useMutation({ onSuccess: () => { onSuccess(); setDeleteConfirm(null); }, onError });

  const { data: detail } = trpc.cartoes.admin.getUserDetail.useQuery(
    { userId: expandedId! },
    { enabled: !!expandedId }
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", padding: "24px 20px 20px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, display: "flex" }}>
            <CreditCard size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 20, margin: 0 }}>Usuários — Cartões</h1>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, margin: 0 }}>{users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* Botão Novo Usuário */}
        <button
          onClick={() => setCreateModal(true)}
          style={{ width: "100%", background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", border: "none", borderRadius: 14, padding: "14px 20px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}
        >
          <Plus size={18} /> Novo Usuário
        </button>

        {/* Lista de usuários */}
        {isLoading ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Carregando...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>
            <Users size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p>Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {users.map((u: any) => (
              <div key={u.id} style={{ background: "#1a1a2e", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(103,80,164,0.3)" }}>
                {/* Card principal */}
                <div style={{ padding: "16px 16px 12px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <User size={20} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{u.name || "Sem nome"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Phone size={12} color="rgba(255,255,255,0.5)" />
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{formatPhone(u.phone)}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <span style={{ background: "rgba(103,80,164,0.3)", color: "#CE93D8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                          {u.numCartoes} cartão{u.numCartoes !== 1 ? "ões" : ""}
                        </span>
                        {u.gastosAbertos > 0 && (
                          <span style={{ background: "rgba(230,81,0,0.2)", color: "#FFB74D", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                            {u.gastosAbertos} gasto{u.gastosAbertos !== 1 ? "s" : ""} aberto{u.gastosAbertos !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => { setResetModal({ id: u.id, name: u.name || u.phone }); setNewPassword(""); }}
                      style={{ flex: 1, background: "rgba(103,80,164,0.2)", border: "1px solid rgba(103,80,164,0.4)", borderRadius: 10, padding: "8px 12px", color: "#CE93D8", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      <KeyRound size={14} /> Resetar Senha
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                      style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      {expandedId === u.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Detalhes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: u.id, name: u.name || u.phone })}
                      style={{ background: "rgba(198,40,40,0.15)", border: "1px solid rgba(198,40,40,0.3)", borderRadius: 10, padding: "8px 12px", color: "#EF9A9A", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {expandedId === u.id && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <Calendar size={12} color="rgba(255,255,255,0.4)" />
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Cadastrado em: {formatDate(u.createdAt)}</span>
                    </div>
                    {detail && detail.cartoes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Cartões</span>
                        {detail.cartoes.map((c: any) => (
                          <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: GRADIENTS[c.corCartao] || GRADIENTS.blue, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                                Limite: R$ {Number(c.limiteTotal).toFixed(2).replace(".", ",")} · Fatura aberta: R$ {Number(c.faturaAberta).toFixed(2).replace(".", ",")}
                              </div>
                            </div>
                            <div style={{ background: "rgba(103,80,164,0.2)", color: "#CE93D8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                              vence dia {c.vencimentoDia}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, margin: 0 }}>Nenhum cartão cadastrado</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Resetar Senha */}
      {resetModal && (
        <Modal title={`Resetar Senha — ${resetModal.name}`} onClose={() => setResetModal(null)}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16 }}>
            A nova senha será aplicada imediatamente. O usuário precisará usar a nova senha no próximo login.
          </p>
          <Input label="Nova Senha" value={newPassword} onChange={setNewPassword} type="password" placeholder="Mínimo 6 caracteres" />
          <button
            onClick={() => { if (newPassword.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; } resetMutation.mutate({ userId: resetModal.id, newPassword }); }}
            disabled={resetMutation.isPending}
            style={{ width: "100%", background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", border: "none", borderRadius: 12, padding: "13px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {resetMutation.isPending ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
            {resetMutation.isPending ? "Salvando..." : "Confirmar Reset"}
          </button>
        </Modal>
      )}

      {/* Modal: Criar Usuário */}
      {createModal && (
        <Modal title="Novo Usuário" onClose={() => setCreateModal(false)}>
          <Input label="Nome completo" value={newName} onChange={setNewName} placeholder="Ex: João Silva" />
          <Input label="Telefone (somente números)" value={newPhone} onChange={setNewPhone} placeholder="Ex: 11999999999" />
          <Input label="Senha inicial" value={newUserPassword} onChange={setNewUserPassword} type="password" placeholder="Mínimo 6 caracteres" />
          <button
            onClick={() => {
              if (!newName || newName.length < 2) { toast.error("Nome obrigatório (mínimo 2 caracteres)"); return; }
              if (!newPhone || newPhone.replace(/\D/g, "").length < 10) { toast.error("Telefone inválido"); return; }
              if (!newUserPassword || newUserPassword.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
              createMutation.mutate({ phone: newPhone.replace(/\D/g, ""), name: newName, password: newUserPassword });
            }}
            disabled={createMutation.isPending}
            style={{ width: "100%", background: "linear-gradient(135deg, #6750A4 0%, #9C27B0 100%)", border: "none", borderRadius: 12, padding: "13px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {createMutation.isPending ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
            {createMutation.isPending ? "Criando..." : "Criar Usuário"}
          </button>
        </Modal>
      )}

      {/* Modal: Confirmar Exclusão */}
      {deleteConfirm && (
        <Modal title="Excluir Usuário" onClose={() => setDeleteConfirm(null)}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 8 }}>
            Tem certeza que deseja excluir <strong style={{ color: "#fff" }}>{deleteConfirm.name}</strong>?
          </p>
          <p style={{ color: "#EF9A9A", fontSize: 13, marginBottom: 20 }}>
            ⚠️ Todos os cartões, gastos, parcelamentos e pagamentos deste usuário serão excluídos permanentemente.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={() => deleteMutation.mutate({ userId: deleteConfirm.id })}
              disabled={deleteMutation.isPending}
              style={{ flex: 1, background: "linear-gradient(135deg, #C62828 0%, #E91E63 100%)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              {deleteMutation.isPending ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={16} />}
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
