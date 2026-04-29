import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  webpack(config, { isServer, webpack }) {
    if (isServer) {
      // @cofhe/sdk references `self` at module initialization time (WASM worker setup).
      // In Node.js (SSR / prerender workers), `self` is undefined. Replace it with globalThis.
      config.plugins.push(
        new webpack.DefinePlugin({ self: "globalThis" })
      );
    }
    return config;
  }
};

export default nextConfig;
