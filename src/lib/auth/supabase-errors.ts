export function isSupabaseUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const cause = (error as Error & { cause?: { code?: string } }).cause;
  return (
    msg.includes("fetch failed") ||
    cause?.code === "ENOTFOUND" ||
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ETIMEDOUT"
  );
}
