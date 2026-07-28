import { trpc } from "@/lib/trpc";

export function useAdminAuth() {
  const { data, isLoading } = trpc.adminAuth.check.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000, // cache por 5 minutos
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
    username: (data as any)?.username as string | undefined,
    isLoading,
  };
}
