export interface SessionScope {
  userId: string | null;
  signal: AbortSignal;
  assertCurrent: () => void;
}

export function createSessionScope(userId: string | null) {
  const controller = new AbortController();
  const scope: SessionScope = {
    userId,
    signal: controller.signal,
    assertCurrent() {
      if (controller.signal.aborted || !userId) {
        throw new Error("A sessão mudou. Repita a operação na conta atual.");
      }
    },
  };
  return { scope, dispose: () => controller.abort() };
}

// A service may still be used without a scope outside private React Query hooks.
export function requestSignal(scope?: SessionScope) {
  scope?.assertCurrent();
  scope?.signal.throwIfAborted();
  return scope?.signal ?? new AbortController().signal;
}
