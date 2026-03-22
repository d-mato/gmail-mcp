export function errorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

export function wrapGmailError(err: unknown, resourceName = "Resource") {
  const error = err as { code?: number; message?: string };
  const code = error.code;
  const msg = error.message ?? String(err);

  if (code === 404) return errorResponse(`${resourceName} not found`);
  if (code === 400) return errorResponse(`Invalid request: ${msg}`);
  if (code === 403) return errorResponse("Insufficient permissions");
  if (code === 429) return errorResponse("Rate limited — try again later");
  return errorResponse(msg);
}
