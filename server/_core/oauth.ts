import type { Express } from "express";

// O Manus OAuth callback foi removido; esta função permanece vazia para evitar
// erros caso seja importada acidentalmente.
export function registerOAuthRoutes(app: Express) {
  // Não registra nenhuma rota OAuth.
}
