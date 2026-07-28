import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const whiteInputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', color: '#000000', fontSize: '16px',
  textAlign: 'center' as const, border: '2px solid #333', borderRadius: '8px',
  padding: '10px 12px', width: '100%', outline: 'none', fontWeight: 500,
};

export default function AdminReferrerBypass() {
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const codesQuery = trpc.referrerBypass.list.useQuery();
  const generateMutation = trpc.referrerBypass.generate.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Código gerado: ${result.code}`);
        setExpiresInDays("30");
        codesQuery.refetch();
      } else {
        toast.error("Erro ao gerar código");
      }
      setIsGenerating(false);
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao gerar código");
      setIsGenerating(false);
    },
  });

  const deleteMutation = trpc.referrerBypass.delete.useMutation({
    onSuccess: () => {
      toast.success("Código deletado!");
      codesQuery.refetch();
    },
    onError: () => toast.error("Erro ao deletar código"),
  });

  const handleGenerate = async () => {
    const days = parseInt(expiresInDays) || 30;
    if (days < 1 || days > 365) {
      toast.error("Dias deve estar entre 1 e 365");
      return;
    }
    setIsGenerating(true);
    generateMutation.mutate({ expiresInDays: days });
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Código copiado!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const codes = codesQuery.data || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <AdminHeader title="Códigos de Bypass para Indicador" />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-black mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Códigos de Bypass para Indicador
        </h1>

        {/* Seção de Geração */}
        <div className="bg-slate-800/50 border border-blue-500/30 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Plus className="w-6 h-6 text-blue-400" />
            Gerar Novo Código
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-blue-300">
                Validade (dias)
              </label>
              <Input
                type="number"
                min="1"
                max="365"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="30"
                style={whiteInputStyle}
              />
              <p className="text-xs text-gray-400 mt-1">Entre 1 e 365 dias</p>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all"
            >
              {isGenerating ? "Gerando..." : "Gerar Código"}
            </Button>
          </div>
        </div>

        {/* Lista de Códigos */}
        <div className="bg-slate-800/50 border border-purple-500/30 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4">Códigos Ativos</h2>
          {codesQuery.isLoading ? (
            <p className="text-gray-400">Carregando...</p>
          ) : codes.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhum código gerado ainda</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-purple-500/20">
                    <th className="text-left py-3 px-4 font-semibold text-purple-300">Código</th>
                    <th className="text-left py-3 px-4 font-semibold text-purple-300">Criado em</th>
                    <th className="text-left py-3 px-4 font-semibold text-purple-300">Expira em</th>
                    <th className="text-left py-3 px-4 font-semibold text-purple-300">Usado</th>
                    <th className="text-center py-3 px-4 font-semibold text-purple-300">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code: any) => {
                    const createdAt = new Date(code.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const expiresAt = new Date(code.expiresAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });
                    const isExpired = new Date(code.expiresAt) < new Date();

                    return (
                      <tr key={code.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4">
                          <code className="bg-slate-900 px-3 py-1 rounded font-mono text-blue-300 font-bold">
                            {code.code}
                          </code>
                        </td>
                        <td className="py-3 px-4 text-gray-300">{createdAt}</td>
                        <td className="py-3 px-4">
                          <span className={isExpired ? "text-red-400" : "text-green-400"}>
                            {expiresAt}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {code.usedAt ? (
                            <span className="text-yellow-400">
                              {new Date(code.usedAt).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-gray-400">Não usado</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleCopy(code.code)}
                              className="p-2 hover:bg-blue-500/20 rounded transition-colors"
                              title="Copiar código"
                            >
                              {copiedCode === code.code ? (
                                <Check className="w-4 h-4 text-green-400" />
                              ) : (
                                <Copy className="w-4 h-4 text-blue-400" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteMutation.mutate({ id: code.id })}
                              className="p-2 hover:bg-red-500/20 rounded transition-colors"
                              title="Deletar código"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="mt-8 bg-slate-800/50 border border-amber-500/30 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-3 text-amber-300">Como Usar</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>✓ Gere um código com validade de 1 a 365 dias</li>
            <li>✓ Compartilhe o código com o cliente</li>
            <li>✓ Cliente coloca o código no cadastro para se registrar sem indicador</li>
            <li>✓ Código é marcado como "usado" após ser aplicado</li>
            <li>✓ Código expirado não pode mais ser utilizado</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
