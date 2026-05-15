import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Provider } from '../types';

const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Maximum length for the stream buffer to prevent unbounded memory growth */
const MAX_STREAM_BUFFER_LENGTH = 100_000;

/** Maximum number of messages kept in memory */
const MAX_MESSAGES = 200;

/** Throttle interval for UI updates during streaming (ms) */
const STREAM_UPDATE_THROTTLE_MS = 50;

/** Thinking delay range (ms) — scales with message length */
const THINKING_DELAY_MIN = 400;
const THINKING_DELAY_MAX = 1200;

// ─── Streaming Metrics ────────────────────────────────────────────────────────

interface StreamingMetrics {
  tokenCount: number;
  tokensPerSecond: number;
  durationMs: number;
}

const EMPTY_METRICS: StreamingMetrics = {
  tokenCount: 0,
  tokensPerSecond: 0,
  durationMs: 0,
};

// ─── AI Status Event Types ────────────────────────────────────────────────────

type AIStatus = 'idle' | 'thinking' | 'streaming' | 'error';

// ─── Return Type ──────────────────────────────────────────────────────────────

interface UseAIChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isStreaming: boolean;
  isThinking: boolean;
  activeProvider: string;
  activeModel: string;
  providers: Provider[];
  setActiveProvider: (id: string) => void;
  setActiveModel: (id: string) => void;
  sendMessage: (content: string) => void;
  clearChat: () => void;
  retryLast: () => void;
  cancelStreaming: () => void;
  streamingMetrics: StreamingMetrics;
  onStreamingComplete?: (response: string, messageId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Approximate token count from text (whitespace-split heuristic) */
function approximateTokenCount(text: string): number {
  if (!text) return 0;
  // A rough approximation: split on whitespace and punctuation boundaries
  return text.split(/\s+|(?=[.,!?;:])|(?<=[.,!?;:])/).filter(Boolean).length;
}

/** Dispatch an AI status change event so other components can react */
function dispatchAIStatus(status: AIStatus): void {
  try {
    window.dispatchEvent(
      new CustomEvent('vibecode:ai-status-change', {
        detail: { status },
      }),
    );
  } catch {
    // CustomEvent may not be available in some test environments
  }
}

/** Dispatch a stream-chunk event for auto-scroll and other reactive consumers */
function dispatchStreamChunk(content: string, isComplete: boolean): void {
  try {
    window.dispatchEvent(
      new CustomEvent('vibecode:stream-chunk', {
        detail: { content, isComplete },
      }),
    );
  } catch {
    // CustomEvent may not be available in some test environments
  }
}

/** Compute a realistic "thinking" delay based on message length */
function computeThinkingDelay(messageContent: string): number {
  const len = messageContent.length;
  // Short messages → short delay; long messages → longer delay
  const base = THINKING_DELAY_MIN + Math.min(len / 2, THINKING_DELAY_MAX - THINKING_DELAY_MIN);
  // Add small jitter (±100ms)
  const jitter = (Math.random() - 0.5) * 200;
  return Math.round(Math.max(THINKING_DELAY_MIN, Math.min(THINKING_DELAY_MAX, base + jitter)));
}

/**
 * Compute the delay for the next simulated chunk based on progress.
 *
 * Speed curve:
 *   0%–20%:  start slow  (30ms) — "warming up"
 *  20%–80%:  accelerate  (10ms) — fast middle
 *  80%–100%: decelerate  (40ms) — "winding down"
 */
function computeSimulatedDelay(progress: number): number {
  if (progress < 0.2) {
    // Interpolate 30ms → 10ms
    const t = progress / 0.2;
    return 30 - t * 20;
  }
  if (progress < 0.8) {
    // Fast middle: ~10ms with slight variation
    return 10 + Math.random() * 5;
  }
  // Decelerate: 10ms → 40ms
  const t = (progress - 0.8) / 0.2;
  return 10 + t * 30;
}

/**
 * Compute chunk size for simulated streaming.
 * Larger chunks in the middle, smaller at start and end.
 */
function computeSimulatedChunkSize(progress: number): number {
  if (progress < 0.15) return 1 + Math.floor(Math.random() * 2);
  if (progress < 0.85) return 2 + Math.floor(Math.random() * 3);
  return 1 + Math.floor(Math.random() * 2);
}

/**
 * Rich set of simulated AI responses for development / demo mode.
 * Responses include natural paragraph breaks and markdown formatting.
 */
const SIMULATED_RESPONSES = [
  `I'll help you with that. Let me analyze your request.\n\nBased on my understanding, here's what I recommend:\n\n1. **Structure the project properly** — Establish clean separation of concerns with well-defined modules\n2. **Implement the core functionality** — Build the main feature set incrementally, starting with the critical path\n3. **Add tests and documentation** — Ensure reliability with comprehensive test coverage and clear docs\n\nThis approach follows proven software engineering practices and will give you a solid foundation. Would you like me to proceed with any of these steps?`,

  `Looking at your request, I can help you build this. Let me break it down:\n\n**Approach:**\n- Create the necessary files with a clear project structure\n- Implement the core logic following SOLID principles\n- Connect everything together with clean interfaces\n\n**Key considerations:**\n- Performance: Optimize critical paths from the start\n- Maintainability: Use clear naming conventions and modular architecture\n- Scalability: Design for future growth without over-engineering\n\nLet me know if you'd like me to start, or if you have specific requirements I should account for.`,

  `Great question! Here's my analysis:\n\nThe key considerations are:\n\n- **Performance**: We should optimize for speed by leveraging caching and lazy loading where appropriate\n- **Maintainability**: Clean, well-documented code with consistent patterns makes future changes painless\n- **Scalability**: Design for future growth using extensible abstractions\n\n**Recommended next steps:**\n\n1. Define the data models and interfaces\n2. Implement the business logic layer\n3. Build the presentation layer\n4. Add integration tests\n\nShall I create a detailed implementation plan?`,

  `I've analyzed the codebase and here's what I found.\n\n**Current state:**\nThe project has a solid foundation but there are a few areas that could benefit from improvement.\n\n**Recommendations:**\n\n1. **Refactor the module structure** — The current layout could be reorganized for better cohesion\n2. **Add error handling** — Several paths lack proper error boundaries and recovery logic\n3. **Improve type safety** — Adding stricter types will catch bugs at compile time\n\nI can generate the specific changes for any of these. Which area would you like me to focus on first?`,

  `Let me think through this carefully.\n\n**Understanding your goal:**\nYou want to implement a feature that integrates cleanly with the existing architecture.\n\n**My plan:**\n\nFirst, I'll create the core data structures and types needed. Then, I'll implement the main logic with proper error handling. Finally, I'll wire it up to the UI layer.\n\n**Potential risks:**\n- Breaking existing functionality — I'll add tests to guard against regressions\n- Performance impact — I'll profile critical sections to ensure we stay within budget\n\nReady to proceed? I'll start with the implementation if you approve.`,
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAIChat(
  onStreamingComplete?: (response: string, messageId: string) => void,
): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [activeProvider, setActiveProvider] = useState('openai');
  const [activeModel, setActiveModel] = useState('gpt-4o');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [streamingMetrics, setStreamingMetrics] = useState<StreamingMetrics>(EMPTY_METRICS);

  // ── Refs ──────────────────────────────────────────────────────────────────

  const streamBufferRef = useRef<string>('');
  const lastUserMessageRef = useRef<string>('');
  const onStreamingCompleteRef = useRef(onStreamingComplete);
  const currentRequestIdRef = useRef<string | null>(null);
  const simulatedIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamStartRef = useRef<number>(0);
  const tokenCountRef = useRef<number>(0);
  const metricsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef<boolean>(false);

  // Throttle state for UI updates
  const lastUpdateTimeRef = useRef<number>(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistantMessageIdRef = useRef<string>('');

  // SSE event listener cleanup
  const sseCleanupRef = useRef<(() => void) | null>(null);

  // Keep the callback ref up to date without triggering re-renders
  useEffect(() => {
    onStreamingCompleteRef.current = onStreamingComplete;
  }, [onStreamingComplete]);

  // ── Metrics updater ──────────────────────────────────────────────────────

  const startMetricsTimer = useCallback(() => {
    streamStartRef.current = Date.now();
    tokenCountRef.current = 0;

    // Update metrics every 200ms for a smooth display
    metricsTimerRef.current = setInterval(() => {
      const durationMs = Date.now() - streamStartRef.current;
      const tokenCount = tokenCountRef.current;
      const tokensPerSecond = durationMs > 0 ? (tokenCount / durationMs) * 1000 : 0;

      setStreamingMetrics({
        tokenCount,
        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
        durationMs,
      });
    }, 200);
  }, []);

  const stopMetricsTimer = useCallback(() => {
    if (metricsTimerRef.current) {
      clearInterval(metricsTimerRef.current);
      metricsTimerRef.current = null;
    }

    // Final metrics snapshot
    const durationMs = Date.now() - streamStartRef.current;
    const tokenCount = tokenCountRef.current;
    const tokensPerSecond = durationMs > 0 ? (tokenCount / durationMs) * 1000 : 0;

    setStreamingMetrics({
      tokenCount,
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      durationMs,
    });
  }, []);

  // ── Throttled message update ─────────────────────────────────────────────

  const flushBufferToMessage = useCallback(() => {
    const currentBuffer = streamBufferRef.current;
    const msgId = assistantMessageIdRef.current;

    setMessages((prev) => {
      const updated = [...prev];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg && lastMsg.id === msgId) {
        updated[updated.length - 1] = {
          ...lastMsg,
          content: currentBuffer,
        };
      }
      return updated;
    });
  }, []);

  const throttledUpdate = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateTimeRef.current;

    if (elapsed >= STREAM_UPDATE_THROTTLE_MS) {
      lastUpdateTimeRef.current = now;
      flushBufferToMessage();
    } else {
      // Schedule a trailing update if one isn't already pending
      if (!pendingTimerRef.current) {
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          lastUpdateTimeRef.current = Date.now();
          flushBufferToMessage();
        }, STREAM_UPDATE_THROTTLE_MS - elapsed);
      }
    }
  }, [flushBufferToMessage]);

  const clearPendingUpdate = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  // ── Handle incoming chunk (shared between SSE and simulated) ─────────────

  const handleChunk = useCallback(
    (chunk: string) => {
      // Bound the stream buffer
      streamBufferRef.current += chunk;
      if (streamBufferRef.current.length > MAX_STREAM_BUFFER_LENGTH) {
        streamBufferRef.current = streamBufferRef.current.slice(-MAX_STREAM_BUFFER_LENGTH);
      }

      // Update token count
      tokenCountRef.current += approximateTokenCount(chunk);

      // Dispatch stream-chunk event for auto-scroll etc.
      dispatchStreamChunk(chunk, false);

      // Throttled React state update
      throttledUpdate();
    },
    [throttledUpdate],
  );

  // ── Load providers on mount ──────────────────────────────────────────────

  useEffect(() => {
    const loadProviders = async () => {
      try {
        // Try the plural namespace first (preload script), then singular (types)
        const api = (window.vibecode as any);
        const providerApi = api?.providers ?? api?.provider;
        if (!providerApi) return;

        const result = await providerApi.list();
        if (result?.success && result.data?.providers && result.data.providers.length > 0) {
          setProviders(result.data.providers);
          setActiveProvider(result.data.providers[0].id);
          if (result.data.providers[0].models.length > 0) {
            setActiveModel(result.data.providers[0].models[0].id);
          }
        }
      } catch {
        // Providers not available — use defaults
      }
    };
    loadProviders();
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearPendingUpdate();
      stopMetricsTimer();
      if (simulatedIntervalRef.current) {
        clearTimeout(simulatedIntervalRef.current);
      }
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
      }
      dispatchAIStatus('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trim messages if they exceed the maximum ─────────────────────────────

  useEffect(() => {
    if (messages.length > MAX_MESSAGES) {
      setMessages((prev) => prev.slice(-MAX_MESSAGES));
    }
  }, [messages.length]);

  // ── Cancel streaming ─────────────────────────────────────────────────────

  const cancelStreaming = useCallback(() => {
    if (!isStreaming && !isThinking) return;

    cancelledRef.current = true;

    // Abort SSE stream if we have a request ID
    const requestId = currentRequestIdRef.current;
    if (requestId) {
      try {
        const api = (window.vibecode as any);
        const providerApi = api?.providers ?? api?.provider;
        if (providerApi?.chatAbort) {
          providerApi.chatAbort(requestId);
        }
      } catch {
        // Best-effort abort
      }
      currentRequestIdRef.current = null;
    }

    // Clear simulated streaming interval
    if (simulatedIntervalRef.current) {
      clearTimeout(simulatedIntervalRef.current);
      simulatedIntervalRef.current = null;
    }

    // Clean up SSE listeners
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }

    // Flush any remaining buffered content
    flushBufferToMessage();
    clearPendingUpdate();
    stopMetricsTimer();

    // Reset state
    setIsStreaming(false);
    setIsThinking(false);
    dispatchAIStatus('idle');

    // Dispatch a final stream-chunk as complete
    dispatchStreamChunk('', true);
  }, [
    isStreaming,
    isThinking,
    flushBufferToMessage,
    clearPendingUpdate,
    stopMetricsTimer,
  ]);

  // ── Finalize streaming (shared completion handler) ───────────────────────

  const finalizeStreaming = useCallback(
    (assistantMessageId: string, userContent: string, error?: string) => {
      // Flush remaining buffer
      flushBufferToMessage();
      clearPendingUpdate();
      stopMetricsTimer();

      // Clean up SSE listeners
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }
      currentRequestIdRef.current = null;

      // If there was an error, update the message
      if (error) {
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.id === assistantMessageId) {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: 'Sorry, I encountered an error. Please try again.',
              metadata: {
                ...lastMsg.metadata,
                error,
              },
            };
          }
          return updated;
        });
        dispatchAIStatus('error');
      }

      setIsStreaming(false);

      // Dispatch final stream-chunk as complete
      dispatchStreamChunk('', true);

      if (!cancelledRef.current && !error) {
        dispatchAIStatus('idle');

        // ── Bridge: Generate proposals from AI response ──────────────────
        const fullResponse = streamBufferRef.current;
        if (fullResponse && onStreamingCompleteRef.current) {
          try {
            onStreamingCompleteRef.current(fullResponse, assistantMessageId);
          } catch (err) {
            console.error('[useAIChat] Proposal generation callback error:', err);
          }
        }

        // Auto-save conversation to memory
        try {
          if (window.vibecode?.memory) {
            window.vibecode.memory.store({
              projectId: 'default',
              type: 'conversation',
              content: `User: ${userContent}\nAssistant: ${fullResponse}`,
              importance: 0.3,
              tags: ['chat', activeProvider, activeModel],
              relatedIds: [],
            });
          }
        } catch {
          // Memory save is best-effort
        }
      }

      cancelledRef.current = false;
    },
    [
      activeProvider,
      activeModel,
      flushBufferToMessage,
      clearPendingUpdate,
      stopMetricsTimer,
    ],
  );

  // ── Real SSE Streaming ───────────────────────────────────────────────────

  const startSSEStreaming = useCallback(
    (
      providerId: string,
      model: string,
      chatMessages: ChatMessage[],
      assistantMessageId: string,
      userContent: string,
    ): void => {
      const api = window.vibecode as any;
      const providerApi = api?.providers ?? api?.provider;

      if (!providerApi?.chatStream) {
        // Fall back to non-streaming chat
        startFallbackChat(providerId, model, chatMessages, assistantMessageId, userContent);
        return;
      }

      const requestId = generateId();
      currentRequestIdRef.current = requestId;

      // Prepare messages for the API — strip metadata to keep payloads lean
      const apiMessages = chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // ── Set up SSE event listeners ─────────────────────────────────────

      let chunkHandler: ((data: any) => void) | null = null;
      let doneHandler: ((data: any) => void) | null = null;
      let errorHandler: ((data: any) => void) | null = null;

      const cleanup = () => {
        // Remove IPC listeners by re-registering no-ops isn't possible with
        // ipcRenderer.on, so we rely on the requestId check to ignore stale events.
        sseCleanupRef.current = null;
      };

      chunkHandler = (data: { requestId: string; content: string }) => {
        if (data.requestId !== currentRequestIdRef.current) return;
        if (cancelledRef.current) return;
        handleChunk(data.content);
      };

      doneHandler = (data: { requestId: string; aborted?: boolean }) => {
        if (data.requestId !== currentRequestIdRef.current) return;
        if (cancelledRef.current) return;
        cleanup();
        finalizeStreaming(assistantMessageId, userContent);
      };

      errorHandler = (data: { requestId: string; error: string }) => {
        if (data.requestId !== currentRequestIdRef.current) return;
        if (cancelledRef.current) return;
        cleanup();
        finalizeStreaming(assistantMessageId, userContent, data.error);
      };

      // Register listeners
      if (providerApi.onChatChunk) {
        providerApi.onChatChunk(chunkHandler);
      }
      if (providerApi.onChatDone) {
        providerApi.onChatDone(doneHandler);
      }
      if (providerApi.onChatError) {
        providerApi.onChatError(errorHandler);
      }

      sseCleanupRef.current = cleanup;

      // ── Initiate the stream ────────────────────────────────────────────

      providerApi
        .chatStream(providerId, apiMessages, requestId)
        .then((result: any) => {
          if (!result?.success) {
            const errMsg = result?.error ?? 'Streaming failed';
            cleanup();
            finalizeStreaming(assistantMessageId, userContent, errMsg);
          }
        })
        .catch((err: any) => {
          cleanup();
          finalizeStreaming(
            assistantMessageId,
            userContent,
            err instanceof Error ? err.message : 'Stream initiation failed',
          );
        });
    },
    [handleChunk, finalizeStreaming],
  );

  // ── Fallback non-streaming chat ──────────────────────────────────────────

  const startFallbackChat = useCallback(
    (
      providerId: string,
      model: string,
      chatMessages: ChatMessage[],
      assistantMessageId: string,
      userContent: string,
    ) => {
      const api = window.vibecode as any;
      const providerApi = api?.providers ?? api?.provider;

      if (!providerApi?.chat) {
        // No chat API at all — simulate
        simulateStreaming(userContent, assistantMessageId);
        return;
      }

      providerApi
        .chat(providerId, model, chatMessages, {
          temperature: 0.7,
          maxTokens: 4096,
          streaming: true,
        })
        .then((result: any) => {
          if (cancelledRef.current) return;

          if (result?.success && result.data?.content) {
            // The old chat() API returns the full response at once.
            // We'll simulate streaming it back chunk-by-chunk for consistency.
            const fullContent = result.data.content as string;
            streamBufferRef.current = fullContent;
            tokenCountRef.current = approximateTokenCount(fullContent);
            flushBufferToMessage();
          }

          finalizeStreaming(assistantMessageId, userContent, result?.success ? undefined : result?.error);
        })
        .catch((err: any) => {
          if (cancelledRef.current) return;
          finalizeStreaming(
            assistantMessageId,
            userContent,
            err instanceof Error ? err.message : 'Chat request failed',
          );
        });
    },
    [finalizeStreaming, flushBufferToMessage],
  );

  // ── Simulated streaming for development ──────────────────────────────────

  const simulateStreaming = useCallback(
    (userContent: string, messageId: string): void => {
      const fullResponse =
        SIMULATED_RESPONSES[Math.floor(Math.random() * SIMULATED_RESPONSES.length)];
      let currentIndex = 0;
      const totalLength = fullResponse.length;

      const tick = () => {
        if (cancelledRef.current || currentIndex >= totalLength) {
          // Done or cancelled
          if (simulatedIntervalRef.current) {
            clearTimeout(simulatedIntervalRef.current);
            simulatedIntervalRef.current = null;
          }

          if (!cancelledRef.current) {
            finalizeStreaming(messageId, userContent);
          }
          return;
        }

        const progress = currentIndex / totalLength;
        const chunkSize = computeSimulatedChunkSize(progress);
        const chunk = fullResponse.slice(currentIndex, currentIndex + chunkSize);
        currentIndex += chunkSize;

        handleChunk(chunk);

        // Schedule next tick with variable delay
        const delay = computeSimulatedDelay(progress);
        simulatedIntervalRef.current = setTimeout(tick, delay);
      };

      // Start the first tick after a brief pause
      simulatedIntervalRef.current = setTimeout(tick, 30);
    },
    [handleChunk, finalizeStreaming],
  );

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming || isThinking) return;

      lastUserMessageRef.current = content;
      cancelledRef.current = false;

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);
      dispatchAIStatus('thinking');

      streamBufferRef.current = '';
      lastUpdateTimeRef.current = 0;
      clearPendingUpdate();

      // Create placeholder assistant message
      const assistantMessageId = generateId();
      assistantMessageIdRef.current = assistantMessageId;

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          provider: activeProvider,
          model: activeModel,
        },
      };

      // Compute a realistic thinking delay
      const thinkingDelay = computeThinkingDelay(content);

      setTimeout(() => {
        if (cancelledRef.current) return;

        setIsThinking(false);
        setIsStreaming(true);
        dispatchAIStatus('streaming');
        setMessages((prev) => [...prev, assistantMessage]);

        // Start metrics tracking
        startMetricsTimer();

        // Decide streaming strategy
        const api = window.vibecode as any;
        const providerApi = api?.providers ?? api?.provider;

        if (providerApi?.chatStream) {
          // Real SSE streaming
          startSSEStreaming(
            activeProvider,
            activeModel,
            [...messages, userMessage],
            assistantMessageId,
            content,
          );
        } else if (providerApi?.chat) {
          // Fallback to non-streaming chat API
          startFallbackChat(
            activeProvider,
            activeModel,
            [...messages, userMessage],
            assistantMessageId,
            content,
          );
        } else {
          // Simulated streaming for development
          simulateStreaming(content, assistantMessageId);
        }
      }, thinkingDelay);
    },
    [
      isStreaming,
      isThinking,
      activeProvider,
      activeModel,
      messages,
      startMetricsTimer,
      startSSEStreaming,
      startFallbackChat,
      simulateStreaming,
      clearPendingUpdate,
    ],
  );

  // ── Clear chat ───────────────────────────────────────────────────────────

  const clearChat = useCallback(() => {
    if (isStreaming || isThinking) {
      cancelStreaming();
    }
    setMessages([]);
    streamBufferRef.current = '';
    setStreamingMetrics(EMPTY_METRICS);
    dispatchAIStatus('idle');
  }, [isStreaming, isThinking, cancelStreaming]);

  // ── Retry last ───────────────────────────────────────────────────────────

  const retryLast = useCallback(() => {
    if (isStreaming || isThinking) return;
    if (!lastUserMessageRef.current) return;

    // Remove the last assistant message
    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated.pop();
      }
      return updated;
    });

    // Resend
    sendMessage(lastUserMessageRef.current);
  }, [isStreaming, isThinking, sendMessage]);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    messages,
    setMessages,
    isStreaming,
    isThinking,
    activeProvider,
    activeModel,
    providers,
    setActiveProvider,
    setActiveModel,
    sendMessage,
    clearChat,
    retryLast,
    cancelStreaming,
    streamingMetrics,
    onStreamingComplete,
  };
}
