import type { MessageOrigin } from "./rules.js";
export interface AssistantRequest {
  request_id: string;
  conversation_id: string;
  action: "question" | "draft_entry" | "improve_note";
  text: string;
}
export interface AssistantOptions {
  signal?: AbortSignal;
  timeout_ms?: number;
}
export interface AssistantReply {
  status:
    | "answered"
    | "pending_proposal"
    | "note_suggestion"
    | "not_understood"
    | "rejected"
    | "sensitive_dropped"
    | "invalid_request"
    | "unavailable"
    | "timeout"
    | "aborted";
  text: string | null;
  proposal_id: string | null;
}
export interface AssistantService {
  handle(
    request: unknown,
    origin: MessageOrigin,
    options?: AssistantOptions,
  ): Promise<AssistantReply>;
}
