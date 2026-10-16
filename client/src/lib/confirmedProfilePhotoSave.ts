type PhotoInput = { id: number; profilePhotoUrl?: string };
type PhotoCache = {
  cancelReads: () => Promise<unknown>;
  applyConfirmed: (id: number, url: string | null) => void;
};

/** Only acknowledged server values enter the cache. An empty string is an explicit removal. */
export async function reconcileConfirmedProfilePhoto(input: PhotoInput, saved: unknown, cache: PhotoCache): Promise<boolean> {
  if (input.profilePhotoUrl === undefined) return false;
  const row = saved as { id?: unknown; profilePhotoUrl?: unknown } | null;
  if (!row || Number(row.id) !== input.id || !Object.prototype.hasOwnProperty.call(row, 'profilePhotoUrl') ||
      (row.profilePhotoUrl !== null && typeof row.profilePhotoUrl !== 'string') ||
      (row.profilePhotoUrl ?? '') !== input.profilePhotoUrl.trim()) {
    throw new Error('O servidor não confirmou a alteração da foto. O editor foi mantido aberto para você conferir.');
  }
  // Cancel reads started before the save, including ones that ignore AbortSignal.
  await cache.cancelReads();
  cache.applyConfirmed(input.id, row.profilePhotoUrl as string | null);
  return true;
}

export function replaceConfirmedProfilePhoto<T>(rows: T[] | undefined, id: number, url: string | null): T[] | undefined {
  return rows?.map(row => {
    if (!row || typeof row !== 'object' || Number((row as { id?: unknown }).id) !== id) return row;
    return { ...row, profilePhotoUrl: url };
  });
}

/** React's pending render is asynchronous; this gate also blocks same-tick double clicks. */
export function createCustomerSaveGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    tryStart: () => { if (busy) return false; busy = true; return true; },
    finish: () => { busy = false; },
  };
}
