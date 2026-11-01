// Types for Cloudflare's built-in modules used by the functions
declare module 'cloudflare:sockets' {
  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean },
  ): { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close: () => Promise<void> };
}
