import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Provider, ProposalCard, ExecutionPlan, ExecutionStepUpdate } from '../types';

const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface UseAIChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  activeProvider: string;
  activeModel: string;
  providers: Provider[];
  activeProposal: ProposalCard | null;
  activeExecutionPlan: ExecutionPlan | null;
  executionSteps: ExecutionStepUpdate[];
  setActiveProvider: (id: string) => void;
  setActiveModel: (id: string) => void;
  sendMessage: (content: string) => void;
  clearChat: () => void;
  retryLast: () => void;
  approveProposal: (planId: string) => Promise<void>;
  rejectProposal: (planId: string) => Promise<void>;
  modifyProposalStep: (planId: string, stepId: string, updates: Record<string, unknown>) => Promise<void>;
  rollbackExecution: (planId: string) => Promise<void>;
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [activeProvider, setActiveProvider] = useState('openai');
  const [activeModel, setActiveModel] = useState('gpt-4o');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProposal, setActiveProposal] = useState<ProposalCard | null>(null);
  const [activeExecutionPlan, setActiveExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStepUpdate[]>([]);

  const streamBufferRef = useRef<string>('');
  const lastUserMessageRef = useRef<string>('');
  const currentPlanIdRef = useRef<string | null>(null);
  const unsubProgressRef = useRef<(() => void) | null>(null);

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

  // Listen for stream events (with cleanup)
  useEffect(() => {
    if (!window.vibecode?.provider) return;

    const handleStream = (chunk: string) => {
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
    };

    window.vibecode.provider.onStream(handleStream);

    // Note: onStream uses ipcRenderer.on which we can't easily unsubscribe
    // in this pattern. The buffer is reset per-send which mitigates issues.
  }, []);

  // Listen for execution step updates
  useEffect(() => {
    if (!window.vibecode?.execution) return;

    const handleStepUpdate = (update: ExecutionStepUpdate) => {
      setExecutionSteps((prev) => [...prev, update]);
    };

    window.vibecode.execution.onStepUpdate(handleStepUpdate);

    return () => {
      // Cleanup is handled by component unmount
    };
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

          // After streaming completes, process the AI response for execution proposals
          const fullContent = streamBufferRef.current;
          if (fullContent && window.vibecode?.execution?.processAIResponse) {
            try {
              const result = await window.vibecode.execution.processAIResponse(
                fullContent,
                content,
                {
                  workspaceRoot: undefined, // Will use default
                  openFiles: [],
                }
              );

              if (result.hasProposal && result.proposal && result.intent) {
                const proposal: ProposalCard = {
                  id: result.proposal.id,
                  type: mapActionTypeToProposalType(result.intent.actionType),
                  title: result.intent.goal,
                  description: `Execute ${result.proposal.steps.length} step(s) — ${result.intent.actionType}`,
                  riskLevel: result.intent.riskLevel,
                  status: 'pending',
                  details: {
                    stepCount: result.proposal.steps.length,
                    affectedPaths: result.intent.affectedPaths,
                    confidence: result.intent.confidence,
                    steps: result.proposal.steps.map((s: any) => ({
                      title: s.title,
                      type: s.type,
                      riskLevel: s.riskLevel,
                    })),
                  },
                  timestamp: Date.now(),
                  planId: result.proposal.id,
                  affectedPaths: result.intent.affectedPaths,
                  stepCount: result.proposal.steps.length,
                };

                setActiveProposal(proposal);
                setActiveExecutionPlan(result.proposal);
                currentPlanIdRef.current = result.proposal.id;

                // Auto-approve if low risk and high confidence
                if (result.autoApproved) {
                  await approveProposalInternal(result.proposal.id);
                }
              }
            } catch (proposalErr) {
              console.warn('[AIChat] Proposal processing failed:', proposalErr);
              // This is non-critical — the chat response still shows
            }
          }
        } catch (error) {
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

          // Auto-save conversation to memory (best-effort)
          try {
            if (window.vibecode?.memory) {
              await window.vibecode.memory.store({
                projectId: 'default',
                type: 'conversation',
                content: `User: ${content}\nAssistant: ${streamBufferRef.current}`,
                importance: 0.5,
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

  /** Internal approve function (used by auto-approve and user action) */
  const approveProposalInternal = async (planId: string) => {
    if (!window.vibecode?.execution) return;

    setActiveProposal((prev) =>
      prev ? { ...prev, status: 'executing' as const } : null
    );

    try {
      const result = await window.vibecode.execution.approve(planId);
      if (result) {
        setActiveExecutionPlan(result);
        setActiveProposal((prev) =>
          prev ? { ...prev, status: 'completed' as const } : null
        );

        // Add system message about execution result
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'system',
            content: result.status === 'completed'
              ? `Execution completed: ${result.title} (${result.steps.filter((s: any) => s.status === 'completed').length}/${result.steps.length} steps succeeded)`
              : `Execution ${result.status}: ${result.title}`,
            timestamp: Date.now(),
            metadata: { executionPlanId: planId },
          },
        ]);
      }
    } catch (err) {
      setActiveProposal((prev) =>
        prev ? { ...prev, status: 'failed' as const } : null
      );

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'system',
          content: `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const approveProposal = useCallback(async (planId: string) => {
    await approveProposalInternal(planId);
  }, []);

  const rejectProposal = useCallback(async (planId: string) => {
    if (!window.vibecode?.execution) return;
    try {
      await window.vibecode.execution.reject(planId);
      setActiveProposal((prev) =>
        prev ? { ...prev, status: 'rejected' as const } : null
      );
    } catch {
      // Reject failed
    }
  }, []);

  const modifyProposalStep = useCallback(
    async (planId: string, stepId: string, updates: Record<string, unknown>) => {
      if (!window.vibecode?.execution) return;
      try {
        await window.vibecode.execution.modifyStep(planId, stepId, updates);
      } catch {
        // Modify failed
      }
    },
    [],
  );

  const rollbackExecution = useCallback(async (planId: string) => {
    if (!window.vibecode?.execution) return;
    try {
      await window.vibecode.execution.rollback(planId);
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'system',
          content: `Execution rolled back: files restored to pre-execution state`,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      // Rollback failed
    }
  }, []);

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
    setActiveProposal(null);
    setActiveExecutionPlan(null);
    setExecutionSteps([]);
  }, [isStreaming, isThinking]);

  const retryLast = useCallback(() => {
    if (isStreaming || isThinking) return;
    if (!lastUserMessageRef.current) return;

    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
        updated.pop();
      }
      return updated;
    });

    sendMessage(lastUserMessageRef.current);
  }, [isStreaming, isThinking, sendMessage]);

  return {
    messages,
    isStreaming,
    isThinking,
    activeProvider,
    activeModel,
    providers,
    activeProposal,
    activeExecutionPlan,
    executionSteps,
    setActiveProvider,
    setActiveModel,
    sendMessage,
    clearChat,
    retryLast,
    approveProposal,
    rejectProposal,
    modifyProposalStep,
    rollbackExecution,
  };
}

/** Map the orchestrator's action type to a ProposalCard type */
function mapActionTypeToProposalType(
  actionType: 'create' | 'modify' | 'delete' | 'analyze' | 'execute' | 'explain' | 'multi_step'
): ProposalCard['type'] {
  switch (actionType) {
    case 'create':
      return 'file_create';
    case 'modify':
      return 'file_edit';
    case 'execute':
      return 'command';
    case 'analyze':
      return 'analysis';
    case 'multi_step':
      return 'plan';
    default:
      return 'plan';
  }
}
