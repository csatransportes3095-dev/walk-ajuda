import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdminActionPasswordDialogProps = {
  open: boolean;
  title?: string;
  description: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
  isPending?: boolean;
};

export default function AdminActionPasswordDialog({
  open,
  title = "Autorizar alteração PIX",
  description,
  onCancel,
  onConfirm,
  isPending = false,
}: AdminActionPasswordDialogProps) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) setPassword("");
  }, [open]);

  const cancel = () => {
    setPassword("");
    onCancel();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) return;
    onConfirm(password);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) cancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-yellow-400" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-amber-300/90">{description} Nenhum dado será alterado antes da confirmação.</p>
          <div className="space-y-2">
            <Label htmlFor="admin-action-password">Senha interna</Label>
            <Input
              id="admin-action-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="Digite a senha interna"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
            <Button type="submit" disabled={!password || isPending}>
              {isPending ? "Verificando..." : "Continuar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
