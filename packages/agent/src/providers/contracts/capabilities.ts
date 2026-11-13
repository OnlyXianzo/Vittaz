/**
 * Model capability metadata owned by Vittaz.
 *
 * A capability is a three-state value on purpose. `true` means the adapter can
 * rely on it, `false` means it is known to be unavailable, and `"unknown"` means
 * nobody has verified it. Callers must not treat `"unknown"` as `true`: this
 * codebase never assumes that every model streams, calls tools or returns
 * structured output, because a wrong assumption becomes a runtime failure the
 * user experiences as a generic assistant error.
 */
export type CapabilityState = boolean | "unknown";

export interface ModelCapabilities {
  readonly streaming: CapabilityState;
  readonly tool_calling: CapabilityState;
  readonly structured_output: CapabilityState;
  /** `null` means the context window has not been verified. */
  readonly max_context_tokens: number | null;
}

/** The only honest default: nothing has been verified for this model. */
export const UNKNOWN_CAPABILITIES: ModelCapabilities = {
  streaming: "unknown",
  tool_calling: "unknown",
  structured_output: "unknown",
  max_context_tokens: null,
};

/**
 * Builds a capability record where every field that is not stated explicitly
 * stays `"unknown"`. Partial knowledge must not be silently widened.
 */
export function declare_capabilities(
  declared: Partial<ModelCapabilities> = {},
): ModelCapabilities {
  return {
    streaming: declared.streaming ?? "unknown",
    tool_calling: declared.tool_calling ?? "unknown",
    structured_output: declared.structured_output ?? "unknown",
    max_context_tokens: declared.max_context_tokens ?? null,
  };
}
