import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Google OAuth avatars
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Supabase Storage avatars
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      // Dog CEO puppy images
      {
        protocol: "https",
        hostname: "images.dog.ceo",
      },
    ],
  },
};

export default nextConfig;
