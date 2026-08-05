/** Defers effect work to the next microtask (react-hooks/set-state-in-effect). */
export function runQueuedInEffect(fn: () => void | (() => void)): () => void {
  let cancelled = false;
  let dispose: void | (() => void);
  queueMicrotask(() => {
    if (!cancelled) dispose = fn();
  });
  return () => {
    cancelled = true;
    dispose?.();
  };
}
