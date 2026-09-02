/** @type {import('next').NextConfig} */
const nextConfig = {
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
