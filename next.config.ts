import type { NextConfig } from "next";
export default { experimental: { serverActions: { bodySizeLimit: "1mb" } } } satisfies NextConfig;
