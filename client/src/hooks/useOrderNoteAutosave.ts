import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { getOrderNoteAutosave } from "@/lib/orderNoteAutosave";

export function useOrderNoteAutosave(registrationId: number) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const queue = useMemo(() => getOrderNoteAutosave(queryClient, registrationId, async (id, content) => {
    await utils.client.orderNotes.saveBlock.mutate({ id, content });
    await utils.orderNotes.getAll.cancel({ registrationId });
    // Only acknowledge the exact payload that reached the server. No refetch per keystroke.
    utils.orderNotes.getAll.setData({ registrationId }, previous => previous?.map(block =>
      block.id === id ? { ...block, content, updatedAt: new Date() } : block
    ));
  }), [queryClient, registrationId, utils]);
  useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  useEffect(() => () => { void queue.flushAll(); }, [queue]);
  return queue;
}
