export type ProductManifestRequest = {
  productId: number;
  actionKey: string;
  actionLabel: string;
  resolve: (accepted: boolean) => void;
};

export function requestProductManifest(productId: number, actionKey: string, actionLabel: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<ProductManifestRequest>("h2:product-manifest-request", { detail: { productId, actionKey, actionLabel, resolve } }));
  });
}
