import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ShoppingBag, Lock, User } from "lucide-react";
import { toast } from "sonner";

export default function ResellerLogin() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const utils = trpc.useUtils();
  const loginMut = trpc.resellers.login.useMutation({
    onSuccess: async () => {
      await utils.resellers.check.invalidate();
      toast.success("Login realizado com sucesso!");
      navigate("/revendedor/dashboard");
    },
    onError: (err) => {
      toast.error(err.message || "Usuário ou senha inválidos");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    loginMut.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800/80 border-gray-700 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Área do Revendedor</CardTitle>
          <p className="text-gray-400 text-sm mt-1">Acesse seu painel de revendas</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Seu usuário"
                  autoComplete="username"
                  className="pl-10 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-amber-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  className="pl-10 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-amber-500"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loginMut.isPending}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold mt-2"
            >
              {loginMut.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
