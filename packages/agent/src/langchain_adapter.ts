import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  ChatMessage as NativeMessage,
} from "@langchain/core/messages";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { ChatResult } from "@langchain/core/outputs";
import { PrivacyRedactor } from "@vittaz/core";
import { validateCompletionRequest } from "./provider_client.js";
import type {
  ChatCompletionParams,
  ChatCompletionResult,
  CompletionClient,
} from "./provider_client.js";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import { ReadOnlyQaLoop } from "./qa_loop.js";
import type {
  AnswerQuestionResult,
  QuestionAnsweringAgent,
} from "./qa_loop.js";
import type { QaDataSource } from "./tools.js";
import { report_agent_diagnostic } from "./diagnostics.js";
import type {
  AgentDiagnosticFailureStage,
  AgentDiagnosticReason,
} from "./diagnostics.js";
function adapter_failure_reason(error: unknown): AgentDiagnosticReason {
  if (error instanceof BadRequestNoFallbackError) return "request_rejected";
  if (error instanceof AllKeysFailedError) {
    const reasons = new Set(error.failures.map((failure) => failure.reason));
    if (reasons.size === 1) {
      const [reason] = reasons;
      if (
        reason === "unauthorized" ||
        reason === "rate_limited" ||
        reason === "connection_error" ||
        reason === "access_denied" ||
        reason === "provider_unavailable" ||
        reason === "provider_http_error" ||
        reason === "protocol_error"
      )
        return reason;
    }
    return "provider_error";
  }
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  if (error instanceof Error && error instanceof LangChainAdapterError)
    return "callback_error";
  return "langchain_error";
}
export class LangChainAdapterError extends Error {
  constructor() {
    super("LangChain adapter request could not be completed safely");
    this.name = "LangChainAdapterError";
  }
}
/** _configureSync must not replace this policy with a permissive base copy. */
class NoTelemetryCallbacks extends CallbackManager {
  override copy(): CallbackManager {
    return new NoTelemetryCallbacks();
  }
  override addHandler(): never {
    throw new LangChainAdapterError();
  }
}
/** Private one-shot native model. No DB, tools execution, cache, retries or exposed callbacks. */
class CompletionBridge extends BaseChatModel {
  #complete: () => Promise<ChatCompletionResult>;
  constructor(complete: () => Promise<ChatCompletionResult>) {
    super({
      callbacks: new NoTelemetryCallbacks(),
      cache: false,
      maxRetries: 0,
      verbose: false,
      outputVersion: "v0",
    });
    this.#complete = complete;
    this.disableStreaming = true;
  }
  _llmType(): string {
    return "vittaz_restricted";
  }
  async _generate(): Promise<ChatResult> {
    const result = await this.#complete();
    const tool_calls: NonNullable<AIMessage["tool_calls"]> = [];
    const invalid_tool_calls: NonNullable<AIMessage["invalid_tool_calls"]> = [];
    for (const [index, call] of result.toolCalls.entries()) {
      const id = call.id ?? `native_${index}`;
      try {
        const args: unknown = JSON.parse(call.function.arguments);
        if (!args || typeof args !== "object" || Array.isArray(args))
          throw new Error();
        tool_calls.push({
          id,
          name: call.function.name,
          args: args as Record<string, unknown>,
          type: "tool_call",
        });
      } catch {
        invalid_tool_calls.push({
          id,
          name: call.function.name,
          args: call.function.arguments,
          type: "invalid_tool_call",
          error: "Invalid tool arguments",
        });
      }
    }
    return {
      generations: [
        {
          text: result.content,
          message: new AIMessage({
            content: result.content,
            tool_calls,
            invalid_tool_calls,
            response_metadata: { vittaz_completion: result },
            usage_metadata: {
              input_tokens: result.usage.prompt_tokens,
              output_tokens: result.usage.completion_tokens,
              total_tokens: result.usage.total_tokens,
            },
          }),
        },
      ],
    };
  }
}
/** Buffered CompletionClient contract; original validated wire is never rewritten by the framework. */
export class LangChainCompletionClient implements CompletionClient {
  #client: CompletionClient;
  #redactor: PrivacyRedactor;
  constructor(client: CompletionClient, redactor?: PrivacyRedactor) {
    this.#client = client;
    this.#redactor = redactor ?? new PrivacyRedactor();
  }
  async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    let failure_stage: AgentDiagnosticFailureStage = "request_validation";
    try {
      const { wire, callerSignal } = validateCompletionRequest(
        params,
        this.#redactor,
      );
      if (
        params.onStreamDelta != null ||
        params.onStreamReset != null ||
        callerSignal?.aborted
      )
        throw new LangChainAdapterError();
      const bridge = new CompletionBridge(() =>
        this.#client.chatCompletion({
          ...wire,
          signal: callerSignal,
          onDiagnostic: params.onDiagnostic,
        }),
      );
      failure_stage = "provider_call";
      report_agent_diagnostic(params.onDiagnostic, {
        event_code: "langchain_invoke_started",
        source: "langchain",
        outcome: "started",
      });
      const message = await bridge.invoke(
        wire.messages.map(
          (message) =>
            new NativeMessage({
              role: message.role,
              content: message.content ?? "",
            }),
        ),
        {
          signal: callerSignal,
          callbacks: new NoTelemetryCallbacks(),
          tags: [],
          metadata: {},
          configurable: {},
        },
      );
      failure_stage = "completion_validation";
      report_agent_diagnostic(params.onDiagnostic, {
        event_code: "langchain_invoke_succeeded",
        source: "langchain",
        outcome: "completed",
        reason_code: "ok",
      });
      // Preserve raw malformed tool arguments for the authoritative S22 validation boundary.
      return structuredClone(
        message.response_metadata.vittaz_completion as ChatCompletionResult,
      );
    } catch (error) {
      report_agent_diagnostic(params.onDiagnostic, {
        event_code: "langchain_invoke_failed",
        source: "langchain",
        outcome: "failed",
        reason_code: adapter_failure_reason(error),
        failure_stage,
      });
      if (
        error instanceof BadRequestNoFallbackError ||
        error instanceof AllKeysFailedError
      )
        throw error;
      if (error instanceof Error && error.name === "AbortError") {
        const cancelled = new Error("Provider request cancelled or timed out");
        cancelled.name = "AbortError";
        throw cancelled;
      }
      throw new LangChainAdapterError();
    }
  }
}
/** Same bounded Q&A interface as the native adapter, not a second unbounded agent loop. */
export class LangChainQaAgent implements QuestionAnsweringAgent {
  #loop: ReadOnlyQaLoop;
  constructor(params: {
    client: CompletionClient;
    data: QaDataSource;
    redactor: PrivacyRedactor;
    onDiagnostic?: import("./diagnostics.js").AgentDiagnosticReporter;
  }) {
    this.#loop = new ReadOnlyQaLoop({
      ...params,
      client: new LangChainCompletionClient(params.client, params.redactor),
    });
  }
  answerQuestion(
    question: unknown,
    options?: unknown,
  ): Promise<AnswerQuestionResult> {
    return this.#loop.answerQuestion(question, options);
  }
}
