import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We hand-write CLAUDE.md; don't let Next overwrite it.
  agentRules: false,
  // better-sqlite3 is a native addon — it must not be bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],

  // prompts/*.md are read from disk at request time (see src/lib/prompts.ts).
  // Nothing imports them, so file tracing would leave them out of the deployment
  // and every model call would 404 at runtime.
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
