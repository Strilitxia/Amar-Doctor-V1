/** @type {import('next').NextConfig} */
const nextConfig = {
  // @ricky0123/vad-web (Whisper fallback tier) and onnxruntime-web are only
  // ever dynamically imported client-side (browser mic/VAD code), but their
  // package exports map resolves "onnxruntime-web/wasm" to null under the
  // "node" condition, which breaks Next's SSR bundling pass for this client
  // component even though the code never actually runs on the server.
  // Marking them external skips static bundling for the server target.
  serverExternalPackages: ["onnxruntime-web", "@ricky0123/vad-web"],
  async headers() {
    return [
      {
        // Apply Permissions-Policy on ALL routes so the browser
        // grants microphone and camera to the page
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=*, camera=*, autoplay=*, display-capture=*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
