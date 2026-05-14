import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Provider } from '../types';

const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface UseAIChatReturn {
  messages: ChatMessage[];
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
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [activeProvider, setActiveProvider] = useState('openai');
  const [activeModel, setActiveModel] = useState('gpt-4o');
  const [providers, setProviders] = useState<Provider[]>([]);
  const streamBufferRef = useRef<string>('');
  const lastUserMessageRef = useRef<string>('');

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const result = await window.vibecode?.provider.list();
        if (result && result.length > 0) {
          setProviders(result);
          setActiveProvider(result[0].id);
          if (result[0].models.length > 0) {
            setActiveModel(result[0].models[0].id);
          }
        }
      } catch {
        // Providers not available - use defaults
      }
    };
    loadProviders();
  }, []);

  // Listen for stream events
  useEffect(() => {
    if (!window.vibecode?.provider) return;

    window.vibecode.provider.onStream((chunk: string) => {
      streamBufferRef.current += chunk;
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: streamBufferRef.current,
          };
        }
        return updated;
      });
    });
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (isStreaming || isThinking) return;

      lastUserMessageRef.current = content;

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);
      streamBufferRef.current = '';

      // Create placeholder assistant message
      const assistantMessageId = generateId();
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

      // Start streaming after a brief "thinking" period
      setTimeout(async () => {
        setIsThinking(false);
        setIsStreaming(true);
        setMessages((prev) => [...prev, assistantMessage]);

        try {
          if (window.vibecode?.provider) {
            // Use real IPC for streaming
            await window.vibecode.provider.chat(
              activeProvider,
              activeModel,
              [...messages, userMessage],
              {
                temperature: 0.7,
                maxTokens: 4096,
              },
            );
          } else {
            // Fallback: simulate streaming for development
            await simulateStreaming(
              content,
              assistantMessageId,
            );
          }
        } catch (error) {
          // On error, add error message
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.id === assistantMessageId) {
              updated[updated.length - 1] = {
                ...lastMsg,
                content: 'Sorry, I encountered an error. Please try again.',
                metadata: {
                  ...lastMsg.metadata,
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
              };
            }
            return updated;
          });
        } finally {
          setIsStreaming(false);

          // Auto-save conversation to memory
          try {
            if (window.vibecode?.memory) {
              await window.vibecode.memory.store({
                projectId: 'default',
                type: 'conversation',
                content: `User: ${content}\nAssistant: ${streamBufferRef.current}`,
                importance: 3,
                tags: ['chat', activeProvider, activeModel],
                relatedIds: [],
              });
            }
          } catch {
            // Memory save is best-effort
          }
        }
      }, 600);
    },
    [isStreaming, isThinking, activeProvider, activeModel, messages],
  );

  // Simulate streaming for development
  const simulateStreaming = useCallback(
    (userContent: string, messageId: string): Promise<void> => {
      return new Promise((resolve) => {
        const responses = [
          `I'll help you with that. Let me analyze your request about "${userContent.slice(0, 50)}...".\n\nBased on my understanding, here's what I recommend:\n\n1. First, we should structure the project properly\n2. Then implement the core functionality\n3. Finally, add tests and documentation\n\nWould you like me to proceed with any of these steps?`,
          `Looking at your request, I can help you build this. Let me break it down:\n\n**Approach:**\n- Create the necessary files\n- Implement the core logic\n- Connect everything together\n\nLet me know if you'd like me to start, or if you have specific requirements.`,
          `Great question! Here's my analysis:\n\nThe key considerations are:\n- **Performance**: We should optimize for speed\n- **Maintainability**: Clean, well-documented code\n- **Scalability**: Design for future growth\n\nShall I create a detailed implementation plan?`,
        ];

        const fullResponse = responses[Math.floor(Math.random() * responses.length)];
        let currentIndex = 0;
        const chunkSize = 3;

        const interval = setInterval(() => {
          if (currentIndex >= fullResponse.length) {
            clearInterval(interval);
            resolve();
            return;
          }

          const chunk = fullResponse.slice(currentIndex, currentIndex + chunkSize);
          currentIndex += chunkSize;
          streamBufferRef.current += chunk;

          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.id === messageId) {
              updated[updated.length - 1] = {
                ...lastMsg,
                content: streamBufferRef.current,
              };
            }
            return updated;
          });
        }, 20);
      });
    },
    [],
  );

  const clearChat = useCallback(() => {
    if (isStreaming || isThinking) return;
    setMessages([]);
    streamBufferRef.current = '';
  }, [isStreaming, isThinking]);

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

  return {
    messages,
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
  };
}
