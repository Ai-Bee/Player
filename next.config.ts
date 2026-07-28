import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  transpilePackages: [
    '@capacitor/core', 
    '@capacitor/android', 
    '@supabase/supabase-js', 
    'axios', 
    'zustand'
  ],
};

export default nextConfig;
