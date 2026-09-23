/**
 * Buffers a request body up to `maxBytes`, counting the bytes actually streamed
 * (Content-Length is optional and untrusted). Returns null when the body is too
 * large; otherwise a replayable Request, so callers keep using formData()/json().
 */
export async function limitedRequest(request: Request, maxBytes: number): Promise<Request | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}
