export const privateQueryKeys = {
  resource: (userId: string | null, key: readonly unknown[]) =>
    ["private", userId, ...key] as const,
};
