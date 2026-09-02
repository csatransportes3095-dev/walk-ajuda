import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe2, Mail } from "lucide-react";
import AdminEmailGenerator from "./AdminEmailGenerator";

const PUBLIC_QUERY_URL = "https://portaldeapelacao.iaudit.com.br/person/identity";

type ActiveTool = "email" | "consulta";

export default function AdminEmail() {
  const [activeTool, setActiveTool] = useState<ActiveTool>("email");

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <div className="sticky top-0 z-40 border-b border-gray-800 bg-[#0a0a1a]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto p-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-gray-950/60 p-2">
            <Button
              type="button"
              variant={activeTool === "email" ? "default" : "ghost"}
              onClick={() => setActiveTool("email")}
              className={activeTool === "email" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <Mail className="w-4 h-4 mr-2" />
              Gerador de Email
            </Button>
            <Button
              type="button"
              variant={activeTool === "consulta" ? "default" : "ghost"}
              onClick={() => setActiveTool("consulta")}
              className={activeTool === "consulta" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              <Globe2 className="w-4 h-4 mr-2" />
              Consulta Publica
            </Button>
          </div>
        </div>
      </div>

      {activeTool === "email" ? (
        <AdminEmailGenerator />
      ) : (
        <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Globe2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Consulta Publica</h1>
                <p className="text-sm text-muted-foreground">Portal de Apelacao iAudit</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => window.open(PUBLIC_QUERY_URL, "_blank", "noopener,noreferrer")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir em nova aba
            </Button>
          </div>

          <div className="rounded-xl border border-gray-800 overflow-hidden bg-white">
            <iframe
              src={PUBLIC_QUERY_URL}
              title="Consulta Publica - Portal de Apelacao iAudit"
              className="w-full h-[78vh] min-h-[620px] bg-white"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Se o portal impedir a exibicao dentro desta pagina, use o botao <strong>Abrir em nova aba</strong>. O gerador de email e a consulta continuam independentes.
          </div>
        </div>
      )}
    </div>
  );
}
