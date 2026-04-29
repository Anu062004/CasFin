export async function register() {
  // @cofhe/sdk initializes WASM workers at module load time using `self` (a browser global).
  // This polyfill makes it available in the Node.js SSR environment.
  if (typeof globalThis.self === "undefined") {
    (globalThis as any).self = globalThis;
  }
}
