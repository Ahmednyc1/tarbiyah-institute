import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Testing on a phone over the LAN. Next blocks cross-origin requests for
  // dev-only assets, allowing only localhost and the hostname the server was
  // started with — so with `-H 0.0.0.0` the page's HTML loads and none of its
  // JavaScript does. The wildcard covers the whole subnet, so a new DHCP lease
  // does not break it again. Development only; it has no effect on a build.
  allowedDevOrigins: ["192.168.0.*"],

  images: {
    // next/image refuses a remote host unless it is declared, so that the
    // optimizer cannot be pointed at arbitrary URLs. Instructor photographs
    // live in Supabase Storage.
    //
    // Derived from the project URL rather than hard-coded: the hostname carries
    // the project ref, so a hard-coded one would silently stop resolving the
    // day this points at a different Supabase project.
    remotePatterns: [
      {
        protocol: "https",
        hostname: new URL(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://localhost",
        ).hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  /* config options here */
};

export default nextConfig;
