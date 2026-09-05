import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/** Resolves credentials from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login`. */
export function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const MODELS = {
  /** Reveal, plain chat, protégé — where prompt quality is load-bearing. */
  reason: "claude-opus-5",
  /** Triage and concept tagging — binary/cheap, and triage sits on the critical path (§4.1). */
  cheap: "claude-haiku-4-5",
} as const;

/**
 * Server-side refusal fallback for the Opus 5 calls. On a policy decline the API
 * re-runs the same request on a fallback model inside the same call instead of
 * just stopping. Requires the beta messages namespace.
 */
export const FALLBACK: { betas: Anthropic.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
