import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Search } from 'lucide-react';

interface TreeNode {
  id: number;
  name: string;
  phone: string;
  profilePhotoUrl?: string;
  totalReferred: number;
  children: TreeNode[];
  parent?: TreeNode;
}

export default function ClientReferralTree() {
  const [location, setLocation] = useLocation();
  const [phone, setPhone] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);

  // Ler parâmetro phone da URL ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get('phone');
    if (phoneParam) {
      const cleanPhone = phoneParam.replace(/\D/g, '');
      setPhone(cleanPhone);
      setSelectedPhone(cleanPhone);
    }
  }, []);

  // Buscar dados do cliente específico
  const { data: customerData, isLoading: isLoadingCustomer } = trpc.customers.checkByPhone.useQuery(
    { phone: selectedPhone || '' },
    { enabled: !!selectedPhone }
  );

  // Buscar estatísticas de indicações DO cliente específico (quantos ele indicou)
  const { data: stats } = trpc.referrals.getStats.useQuery(
    { phone: selectedPhone || '' },
    { enabled: !!selectedPhone }
  );

  // Buscar quem ESTE cliente indicou (filhos)
  const { data: referredByMe } = trpc.referrals.getIndicated.useQuery(
    { phone: selectedPhone || '' },
    { enabled: !!selectedPhone }
  );

  // Buscar quem indicou ESTE cliente (pai)
  const { data: referredByCustomer } = trpc.customers.checkByPhone.useQuery(
    { phone: customerData?.customer?.referredByPhone || '' },
    { enabled: !!customerData?.customer?.referredByPhone }
  );

  const handleSearch = () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      setSelectedPhone(cleanPhone);
      setLocation(`/admin/referral-tree?phone=${cleanPhone}`);
    }
  };

  // Construir árvore quando dados chegam
  useEffect(() => {
    if (customerData?.customer && stats) {
      const customer = customerData.customer;
      
      // Nó raiz (cliente selecionado)
      const node: TreeNode = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        profilePhotoUrl: customer.profilePhotoUrl || undefined,
        totalReferred: stats.totalReferred || 0,
        children: (referredByMe || []).map((r: any) => ({
          id: r.customerId,
          name: r.name,
          phone: r.phone,
          profilePhotoUrl: r.profilePhotoUrl,
          totalReferred: 0,
          children: [],
        })),
      };

      // Adicionar parent (quem indicou este cliente)
      // Mas APENAS se não for o ADM (phone 202)
      if (referredByCustomer?.customer && referredByCustomer.customer.phone !== '202') {
        node.parent = {
          id: referredByCustomer.customer.id,
          name: referredByCustomer.customer.name,
          phone: referredByCustomer.customer.phone,
          profilePhotoUrl: referredByCustomer.customer.profilePhotoUrl || undefined,
          totalReferred: 0,
          children: [],
        };
      }

      setTreeData(node);
    }
  }, [customerData, stats, referredByMe, referredByCustomer]);

  const handlePhoneClick = (clickedPhone: string) => {
    setPhone(clickedPhone);
    setSelectedPhone(clickedPhone);
    setLocation(`/admin/referral-tree?phone=${clickedPhone}`);
  };

  const TreeNodeComponent = ({ node, isRoot = false }: { node: TreeNode; isRoot?: boolean }) => {
    return (
      <div className="flex flex-col items-center">
        {/* Nó */}
        <div className={`flex flex-col items-center ${isRoot ? 'mb-8' : 'mb-6'}`}>
          <div className="relative">
            <div
              className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer ${
                isRoot
                  ? 'bg-gradient-to-br from-purple-600/30 to-purple-900/30 border-purple-500 shadow-lg shadow-purple-500/50'
                  : 'bg-slate-800/50 border-slate-600 hover:border-purple-500'
              }`}
              onClick={() => !isRoot && handlePhoneClick(node.phone)}
            >
              {node.profilePhotoUrl && (
                <img
                  src={node.profilePhotoUrl}
                  alt={node.name}
                  className="w-12 h-12 rounded-full object-cover mb-2 border-2 border-purple-500"
                />
              )}
              <p className="font-semibold text-white text-center text-sm max-w-[120px] line-clamp-2">
                {node.name}
              </p>
              <p className="text-xs text-slate-400">{node.phone}</p>
              {node.totalReferred > 0 && (
                <div className="mt-1 px-2 py-1 bg-green-500/20 rounded text-xs text-green-400 font-semibold">
                  {node.totalReferred} indicações
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filhos */}
        {node.children.length > 0 && (
          <div className="relative">
            {/* Linha vertical conectando */}
            <div className="absolute top-0 left-1/2 w-0.5 h-8 bg-gradient-to-b from-purple-500 to-purple-500/30 transform -translate-x-1/2 -translate-y-full" />

            <div className="flex gap-8 justify-center flex-wrap">
              {node.children.map((child) => (
                <div key={child.id} className="relative">
                  {/* Linha horizontal */}
                  <div className="absolute bottom-full left-1/2 w-8 h-8 border-l-2 border-b-2 border-purple-500/50 transform -translate-x-1/2 translate-y-full" />

                  <div className="flex flex-col items-center">
                    <TreeNodeComponent node={child} isRoot={false} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const isLoading = isLoadingCustomer;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/admin/customers')}
            className="text-purple-400 hover:text-purple-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-bold text-white">Árvore de Indicações Individual</h1>
        </div>

        {/* Search */}
        <Card className="bg-slate-900/50 border-purple-500/30 p-4 mb-8">
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Digite o telefone do cliente"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 bg-slate-800 border border-purple-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
            />
            <Button onClick={handleSearch} className="bg-purple-600 hover:bg-purple-700">
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        </Card>

        {!selectedPhone ? (
          <Card className="bg-slate-900/50 border-purple-500/30 p-12 text-center">
            <Search className="w-16 h-16 text-purple-400/50 mx-auto mb-4" />
            <p className="text-slate-300 text-lg">Digite um telefone para visualizar a árvore de indicações</p>
          </Card>
        ) : isLoading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin">
              <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full" />
            </div>
            <p className="text-slate-300 mt-6">Carregando árvore...</p>
          </div>
        ) : !customerData?.customer ? (
          <Card className="bg-slate-900/50 border-red-500/30 p-12 text-center">
            <p className="text-red-400 text-lg">Cliente não encontrado</p>
          </Card>
        ) : treeData ? (
          <Card className="bg-slate-900/50 border-purple-500/30 p-8 overflow-x-auto">
            <div className="flex justify-center py-8">
              {/* Mostrar pai acima */}
              {treeData.parent && (
                <div className="flex flex-col items-center w-full mb-8">
                  <div className="text-sm text-slate-400 mb-2">Indicado por:</div>
                  <TreeNodeComponent node={treeData.parent} isRoot={false} />
                  <div className="w-0.5 h-12 bg-gradient-to-b from-purple-500 to-purple-500/30" />
                </div>
              )}
              
              {/* Cliente principal */}
              <TreeNodeComponent node={treeData} isRoot={true} />
            </div>
          </Card>
        ) : null}

        {/* Legenda */}
        {selectedPhone && customerData && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-900/50 border-purple-500/30 p-4">
              <p className="text-slate-400 text-sm">Total Indicado</p>
              <p className="text-2xl font-bold text-green-400">{stats?.totalReferred || 0}</p>
            </Card>
            <Card className="bg-slate-900/50 border-purple-500/30 p-4">
              <p className="text-slate-400 text-sm">Indicado por</p>
              <p className="text-lg font-bold text-blue-400">
                {referredByCustomer?.customer && referredByCustomer.customer.phone !== '202'
                  ? referredByCustomer.customer.name
                  : 'Ninguém'}
              </p>
            </Card>
            <Card className="bg-slate-900/50 border-purple-500/30 p-4">
              <p className="text-slate-400 text-sm">Status</p>
              <p className="text-lg font-bold text-purple-400">Ativo</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
