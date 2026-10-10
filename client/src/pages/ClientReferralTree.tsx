import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Search } from "lucide-react";

type ReferralTreeNode = {
  customerId: number;
  name: string;
  phone: string;
  profilePhotoUrl?: string | null;
  totalReferred: number;
  children: ReferralTreeNode[];
};

function formatPhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value;
}

function ReferralNode({
  node,
  isRoot = false,
  onOpen,
}: {
  node: ReferralTreeNode;
  isRoot?: boolean;
  onOpen: (phone: string) => void;
}) {
  return (
    <div className="flex min-w-max flex-col items-center">
      <button
        type="button"
        onClick={() => !isRoot && onOpen(node.phone)}
        className={`min-w-[180px] max-w-[220px] rounded-2xl border-2 p-4 text-center transition-all ${
          isRoot
            ? "border-purple-400 bg-purple-500/20 shadow-[0_0_28px_rgba(168,85,247,.22)]"
            : "border-slate-700 bg-slate-900/80 hover:border-purple-500/60 hover:bg-slate-800"
        }`}
      >
        {node.profilePhotoUrl ? (
          <img
            src={node.profilePhotoUrl}
            alt={node.name}
            className="mx-auto mb-2 h-14 w-14 rounded-full border-2 border-purple-400/70 object-cover"
          />
        ) : (
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-purple-400/40 bg-purple-500/10 text-xl font-black text-purple-200">
            {String(node.name || "?").trim().slice(0, 1).toUpperCase()}
          </div>
        )}

        <p className="line-clamp-2 text-sm font-black text-white">{node.name}</p>
        <p className="mt-1 text-[11px] text-slate-400">{formatPhone(node.phone)}</p>
        <div className="mt-2 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-black text-emerald-300">
          Indicou {node.totalReferred}
        </div>
      </button>

      {node.children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="h-8 w-0.5 bg-purple-500/50" />
          <div className="relative flex flex-wrap justify-center gap-8 border-t border-purple-500/35 pt-8">
            {node.children.map((child) => (
              <div key={child.customerId} className="relative pt-0">
                <div className="absolute -top-8 left-1/2 h-8 w-0.5 -translate-x-1/2 bg-purple-500/35" />
                <ReferralNode node={child} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientReferralTree() {
  const [, setLocation] = useLocation();
  const [phone, setPhone] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get("phone");
    if (!phoneParam) return;
    const cleanPhone = phoneParam.replace(/\D/g, "");
    setPhone(cleanPhone);
    setSelectedPhone(cleanPhone);
  }, []);

  const treeQuery = trpc.referrals.getTree.useQuery(
    { phone: selectedPhone || "", depth: 6 },
    {
      enabled: !!selectedPhone,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );

  const handleSearch = () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) return;
    setSelectedPhone(cleanPhone);
    setLocation(`/admin/referral-tree?phone=${cleanPhone}`);
  };

  const handlePhoneClick = (clickedPhone: string) => {
    const cleanPhone = clickedPhone.replace(/\D/g, "");
    setPhone(cleanPhone);
    setSelectedPhone(cleanPhone);
    setLocation(`/admin/referral-tree?phone=${cleanPhone}`);
  };

  const data = treeQuery.data;
  const root = data?.root || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/customers")}
            className="text-purple-400 hover:text-purple-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">Árvore de Indicações</h1>
            <p className="mt-1 text-sm text-slate-400">Quem indicou → cliente → pessoas indicadas → próximos níveis</p>
          </div>
        </div>

        <Card className="mb-6 border-purple-500/30 bg-slate-900/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="tel"
              placeholder="Digite o telefone do cliente"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSearch()}
              className="flex-1 rounded-lg border border-purple-500/30 bg-slate-800 px-4 py-2 text-white outline-none placeholder:text-slate-400 focus:border-purple-500"
            />
            <Button onClick={handleSearch} className="bg-purple-600 hover:bg-purple-700">
              <Search className="mr-2 h-4 w-4" />
              Buscar
            </Button>
          </div>
        </Card>

        {!selectedPhone ? (
          <Card className="border-purple-500/30 bg-slate-900/60 p-12 text-center">
            <Search className="mx-auto mb-4 h-14 w-14 text-purple-400/50" />
            <p className="text-slate-300">Digite um telefone para visualizar a árvore.</p>
          </Card>
        ) : treeQuery.isLoading ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-purple-500/30 border-t-purple-500" />
            <p className="mt-5 text-slate-300">Montando a árvore...</p>
          </div>
        ) : !root ? (
          <Card className="border-red-500/30 bg-slate-900/60 p-12 text-center">
            <p className="text-lg font-bold text-red-300">Cliente não encontrado</p>
          </Card>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Card className="border-purple-500/25 bg-slate-900/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Cliente central</p>
                <p className="mt-1 text-lg font-black text-white">{root.name}</p>
              </Card>
              <Card className="border-blue-500/25 bg-slate-900/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Indicado por</p>
                <p className="mt-1 text-lg font-black text-blue-300">{data?.parent?.name || "Ninguém / origem não identificada"}</p>
              </Card>
              <Card className="border-emerald-500/25 bg-slate-900/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Rede abaixo dele</p>
                <p className="mt-1 text-lg font-black text-emerald-300">{data?.totalDescendants || 0} pessoa(s)</p>
              </Card>
            </div>

            <Card className="overflow-x-auto border-purple-500/30 bg-slate-950/70 p-6 sm:p-8">
              <div className="min-w-max py-4">
                {data?.parent && (
                  <div className="mb-8 flex flex-col items-center">
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-blue-300">Quem indicou este cliente</p>
                    <button
                      type="button"
                      onClick={() => handlePhoneClick(data.parent!.phone)}
                      className="rounded-xl border border-blue-400/35 bg-blue-500/10 px-5 py-3 text-center hover:bg-blue-500/20"
                    >
                      <p className="font-black text-blue-100">{data.parent.name}</p>
                      <p className="text-xs text-blue-300/70">{formatPhone(data.parent.phone)}</p>
                    </button>
                    <div className="h-8 w-0.5 bg-blue-400/40" />
                  </div>
                )}

                <div className="flex justify-center">
                  <ReferralNode node={root} isRoot onOpen={handlePhoneClick} />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
