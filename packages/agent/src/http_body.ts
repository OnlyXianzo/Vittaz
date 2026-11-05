export class ProtocolError extends Error {
  constructor() {
    super("Invalid provider response");
  }
}
export async function* readText(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new ProtocolError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) throw new ProtocolError();
      yield decoder.decode(value, { stream: true });
    }
    decoder.decode(); // Fatal UTF-8 flush validates truncation; no replacement text is emitted.
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
