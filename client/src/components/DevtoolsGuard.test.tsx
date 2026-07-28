import { describe, it, expect, vi } from "vitest";
import DevtoolsGuard from "./DevtoolsGuard";

// Mock do trpc
vi.mock("@/lib/trpc", () => ({
  trpc: {
    settings: {
      getAll: {
        useQuery: vi.fn(() => ({
          data: { devtools_protection: "1" },
        })),
      },
    },
    system: {
      securityAlert: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
        })),
      },
    },
    security: {
      reportDevtools: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
        })),
      },
    },
    adminAuth: {
      logout: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
        })),
      },
    },
  },
}));

// Mock do hook useDevToolsDetection
vi.mock("@/hooks/useDevToolsDetection", () => ({
  useDevToolsDetection: vi.fn((callback, enabled) => {
    if (enabled) {
      setTimeout(() => callback(), 100);
    }
  }),
}));

// Mock do hook useAdminAuth
vi.mock("@/hooks/useAdminAuth", () => ({
  useAdminAuth: vi.fn(() => ({
    isAdmin: false,
  })),
}));

// Mock do wouter
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/", () => {}]),
}));

describe("DevtoolsGuard", () => {
  it("exporta componente corretamente", () => {
    expect(DevtoolsGuard).toBeDefined();
    expect(typeof DevtoolsGuard).toBe("function");
  });

  it("componente é um React component", () => {
    expect(typeof DevtoolsGuard).toBe("function");
  });
});
