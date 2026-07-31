import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Search, Users, TrendingUp, Copy, Check, MessageCircle, Flag, Trash2 } from "lucide-react";

export default function AdminReferrals() {
  const [location] = useLocation();
  const [searchPhone, setSearchPhone] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "history" | "chain" | "indicated">("stats");
  const [copiedCustomerId, setCopiedCustomerId] = useState<number | null>(null);
  const createReportMutation = trpc.referrals.createReport.useMutation();
  const deleteIndicatedMutation = trpc.referrals.deleteIndicated.useMutation();

  // Ler par�metro phone da URL ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get('phone');
    if (phoneParam) {
      const cleanPhone = phoneParam.replace(/\D/g, '');
      setSearchPhone(cleanPhone);
      setSelectedPhone(cleanPhone);
    }
  }, []);

  // Queries
  // Se h� um phone selecionado (via URL ou busca), mostrar apenas dados desse cliente
  // Caso contr�rio, mostrar todos os stats
  const { data: allStats, isLoading: statsLoading } = trpc.referrals.listAll.useQuery(
    undefined,
    { enabled: !selectedPhone } // S� carrega se N�O h� cliente selecionado
  );
  const { data: selectedStats } = trpc.referrals.getStats.useQuery(
    { phone: selectedPhone || "" },
    { enabled: !!selectedPhone }
  );
  const { data: history } = trpc.referrals.getHistory.useQuery(
    { phone: selectedPhone || "" },
    { enabled: !!selectedPhone && activeTab === "history" }
  );
  const { data: chain } = trpc.referrals.getChain.useQuery(
    { phone: selectedPhone || "", depth: 5 },
    { enabled: !!selectedPhone && activeTab === "chain" }
  );
  const { data: indicated } = trpc.referrals.getIndicated.useQuery(
    { phone: selectedPhone || "" },
    { enabled: !!selectedPhone && activeTab === "indicated" }
  );

  const handleSearch = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 10) {
      setSelectedPhone(digits);
    }
  };

  const handleClear = () => {
    setSelectedPhone(null);
    setSearchPhone("");
    setActiveTab("stats");
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Rastreamento de Indica��es</h1>
              <p className="text-gray-400">
                {selectedPhone 
                  ? `Visualizando dados do cliente: ${selectedPhone}`
                  : "Visualize o hist�rico de indica��es, cadeia de refer�ncia e clientes indicados"
                }
              </p>
            </div>
            {selectedPhone && (
              <Button onClick={handleClear} variant="outline" className="text-red-400 border-red-400 hover:bg-red-900/20">
                Limpar Filtro
              </Button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8 flex gap-2">
          <Input
            placeholder="Digite o telefone do cliente (ex: 11999999999)"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleSearch(searchPhone);
            }}
            className="flex-1 bg-gray-900 border-gray-700 text-white"
          />
          <Button
            onClick={() => handleSearch(searchPhone)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Search className="w-4 h-4 mr-2" />
            Buscar
          </Button>
        </div>

        {/* Stats Overview - Mostrar APENAS se n�o h� cliente selecionado */}
        {!selectedPhone && allStats && allStats.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="bg-gray-900 border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total de Indicadores</p>
                  <p className="text-3xl font-bold text-white">{allStats.length}</p>
                </div>
                <Users className="w-12 h-12 text-purple-500 opacity-50" />
              </div>
            </Card>
            <Card className="bg-gray-900 border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total de Indica��es</p>
                  <p className="text-3xl font-bold text-white">
                    {allStats.reduce((sum, s) => sum + s.totalReferred, 0)}
                  </p>
                </div>
                <TrendingUp className="w-12 h-12 text-green-500 opacity-50" />
              </div>
            </Card>
            <Card className="bg-gray-900 border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">M�dia por Indicador</p>
                  <p className="text-3xl font-bold text-white">
                    {(
                      allStats.reduce((sum, s) => sum + s.totalReferred, 0) / allStats.length
                    ).toFixed(1)}
                  </p>
                </div>
                <TrendingUp className="w-12 h-12 text-blue-500 opacity-50" />
              </div>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Top Referrers - Mostrar APENAS se n�o h� cliente selecionado */}
          {!selectedPhone && (
            <div className="lg:col-span-1">
              <Card className="bg-gray-900 border-gray-700 p-6">
                <h2 className="text-xl font-bold text-white mb-4">Top Indicadores</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {statsLoading ? (
                    <p className="text-gray-400">Carregando...</p>
                  ) : (
                    allStats?.slice(0, 10).map((stat) => (
                      <button
                        key={stat.id}
                        onClick={() => {
                          setSelectedPhone(stat.referrerPhone);
                          setActiveTab("stats");
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          selectedPhone === stat.referrerPhone
                            ? "bg-purple-600 text-white"
                            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        <div className="font-semibold text-sm truncate">{stat.referrerName}</div>
                        <div className="text-xs opacity-75">{stat.referrerPhone}</div>
                        <div className="text-xs font-bold text-green-400 mt-1">
                          {stat.totalReferred} indicados
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Right: Details */}
          <div className={selectedPhone ? "lg:col-span-4" : "lg:col-span-3"}>
            {!selectedPhone && !allStats?.length ? (
              <Card className="bg-gray-900 border-gray-700 p-12 text-center">
                <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Selecione um cliente para visualizar detalhes</p>
              </Card>
            ) : selectedPhone ? (
              <>
                {/* Selected Customer Info */}
                {selectedStats && (
                  <Card className="bg-gray-900 border-gray-700 p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-white">{selectedStats.referrerName}</h2>
                        <p className="text-gray-400">{selectedStats.referrerPhone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">Total Indicado</p>
                        <p className="text-4xl font-bold text-purple-500">{selectedStats.totalReferred}</p>
                      </div>
                    </div>
                    {selectedStats.lastReferralAt && (
                      <p className="text-gray-400 text-sm">
                        �ltima indica��o: {new Date(selectedStats.lastReferralAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </Card>
                )}

                {/* Tabs */}
                <div className="flex gap-2 mb-6 border-b border-gray-700">
                  {["stats", "indicated", "history", "chain"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-4 py-2 font-semibold transition-all ${
                        activeTab === tab
                          ? "text-purple-500 border-b-2 border-purple-500"
                          : "text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      {tab === "stats" && "Estat�sticas"}
                      {tab === "indicated" && "Indicados"}
                      {tab === "history" && "Hist�rico"}
                      {tab === "chain" && "Cadeia"}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {activeTab === "stats" && selectedStats && (
                  <div className="space-y-4">
                    <Card className="bg-gray-900 border-gray-700 p-6">
                      <h3 className="text-lg font-bold text-white mb-4">Estat�sticas</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-gray-400 text-sm">Total Indicado</p>
                          <p className="text-3xl font-bold text-green-400">{selectedStats.totalReferred}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">�ltima Indica��o</p>
                          <p className="text-lg font-bold text-blue-400">
                            {selectedStats.lastReferralAt 
                              ? new Date(selectedStats.lastReferralAt).toLocaleDateString("pt-BR")
                              : "Nunca"
                            }
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {activeTab === "indicated" && (
                  <div className="space-y-4">
                    {!indicated || indicated.length === 0 ? (
                      <Card className="bg-gray-900 border-gray-700 p-8 text-center">
                        <p className="text-gray-400">Nenhum cliente indicado</p>
                      </Card>
                    ) : (
                      indicated.map((customer) => {
                        const handleCopyPhone = () => {
                          navigator.clipboard.writeText(customer.phone);
                          setCopiedCustomerId(customer.customerId);
                          setTimeout(() => setCopiedCustomerId(null), 2000);
                        };
                        
                        const isCopied = copiedCustomerId === customer.customerId;
                        
                        return (
                          <Card key={customer.customerId} className="bg-gray-900 border-gray-700 p-4">
                            <div className="flex items-center gap-4">
                              {customer.profilePhotoUrl ? (
                                <img
                                  src={customer.profilePhotoUrl}
                                  alt={customer.name}
                                  className="w-12 h-12 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                                  <Users className="w-6 h-6 text-gray-500" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="font-semibold text-white">{customer.name}</p>
                                    <p className="text-gray-400 text-sm">{customer.phone}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    onClick={handleCopyPhone}
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                    title="Copiar telefone"
                                  >
                                    {isCopied ? (
                                      <Check className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <Copy className="w-4 h-4 text-gray-400 hover:text-gray-300" />
                                    )}
                                  </button>
                                  <a
                                    href={`https://wa.me/55${customer.phone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                    title="Abrir WhatsApp"
                                  >
                                    <MessageCircle className="w-4 h-4 text-green-400" />
                                  </a>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Deletar ${customer.name} do hist�rico de indica��es?`)) {
                                        deleteIndicatedMutation.mutate(
                                          { referredCustomerId: customer.customerId },
                                          {
                                            onSuccess: () => {
                                              alert(`${customer.name} removido com sucesso!`);
                                              // Recarregar dados
                                              window.location.reload();
                                            },
                                            onError: (error) => {
                                              alert(`Erro ao deletar: ${error.message}`);
                                            },
                                          }
                                        );
                                      }
                                    }}
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                    title="Deletar indicado"
                                    disabled={deleteIndicatedMutation.isPending}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </button>
                                </div>
                                {customer.orderStatus && (
                                  <p className="text-xs mt-2 px-2 py-1 rounded inline-block bg-blue-900/30 text-blue-300">
                                    Pedido: {customer.orderStatus}
                                  </p>
                                )}
                              </div>
                              <p className="text-gray-400 text-sm">
                                {new Date(customer.createdAt).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}

                {activeTab === "history" && (
                  <div className="space-y-4">
                    {!history || history.length === 0 ? (
                      <Card className="bg-gray-900 border-gray-700 p-8 text-center">
                        <p className="text-gray-400">Nenhum hist�rico</p>
                      </Card>
                    ) : (
                      history.map((item) => {
                        const cleanPhone = item.referredPhone.replace(/\D/g, '');
                        const whatsappPhone = `55${cleanPhone}`;
                        
                        return (
                          <Card key={item.id} className="bg-gray-900 border-gray-700 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-white">{item.referredName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-gray-400 text-sm">{item.referredPhone}</p>
                                  <a
                                    href={`https://wa.me/${whatsappPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                    title="Abrir WhatsApp"
                                  >
                                    <MessageCircle className="w-4 h-4 text-green-400" />
                                  </a>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-gray-400 text-sm">
                                  {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                                </p>
                                <span
                                  className={`inline-block px-2 py-1 rounded text-xs font-semibold mt-1 ${
                                    item.status === "completed"
                                      ? "bg-green-900 text-green-200"
                                      : "bg-yellow-900 text-yellow-200"
                                  }`}
                                >
                                  {item.status === "completed" ? "Conclu�do" : "Pendente"}
                                </span>
                              </div>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}

                {activeTab === "chain" && (
                  <div className="space-y-4">
                    {!chain || chain.length === 0 ? (
                      <Card className="bg-gray-900 border-gray-700 p-8 text-center">
                        <p className="text-gray-400">Sem cadeia de indica��es</p>
                      </Card>
                    ) : (
                      <div>
                        {chain.map((item, index) => (
                          <div key={index} className="flex items-center gap-4 mb-4">
                            {index > 0 && (
                              <div className="flex flex-col items-center">
                                <ArrowRight className="w-6 h-6 text-gray-600 rotate-90" />
                              </div>
                            )}
                            <Card className="bg-gray-900 border-gray-700 p-4 flex-1">
                              <div className="flex items-center gap-4">
                                {item.profilePhotoUrl ? (
                                  <img
                                    src={item.profilePhotoUrl}
                                    alt={item.name}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-gray-500" />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <p className="font-semibold text-white">{item.name}</p>
                                  <p className="text-gray-400 text-sm">{item.phone}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-400 text-sm">N�vel {item.level}</p>
                                  <p className="text-green-400 font-semibold">{item.totalReferred} indicados</p>
                                </div>
                              </div>
                            </Card>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
