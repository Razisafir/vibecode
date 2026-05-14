import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ProposalCard as ProposalCardType, ProposalCardData } from '../types';
import { useAIChat } from '../hooks/useAIChat';
import { useProposals } from '../hooks/useProposals';
import ProposalCardComponent from './ProposalCard';

interface AIPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width?: number;
}

const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onToggle, width = 400 }) => {
  const {
    proposals,
    approve: approveProposal,
    reject: rejectProposal,
  } = useProposals();

  // Callback: when AI streaming finishes, generate proposals from the response
  const handleStreamingComplete = useCallback(
    async (response: string, messageId: string) => {
      if (!window.vibecode?.proposal) return;

      try {
        const result = await window.vibecode.proposal.generateFromResponse(response);
        if (result.success && result.data?.proposals && result.data.proposals.length > 0) {
          const proposalIds = result.data.proposals.map((p: ProposalCardData) => p.id);

          // Update the assistant message metadata with proposal IDs
          setMessages((prev) => {
            const updated = [...prev];
            const msg = updated.find((m) => m.id === messageId);
            if (msg) {
              updated[updated.indexOf(msg)] = {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  proposalIds,
                },
              };
            }
            return updated;
          });
        }
      } catch (err) {
        console.error('[AIPanel] Failed to generate proposals:', err);
      }
    },
    []
  );

  const {
    messages,
    setMessages,
    isStreaming,
    isThinking,
    sendMessage,
    activeProvider,
    activeModel,
    providers,
    setActiveProvider,
    setActiveModel,
    clearChat,
  } = useAIChat(handleStreamingComplete);

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [inputValue]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming || isThinking) return;
    sendMessage(trimmed);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputValue, isStreaming, isThinking, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleApproveProposal = useCallback(
    (proposalId: string) => {
      const proposal = proposals.find((p) => p.id === proposalId);
      if (proposal?.planId) {
        approveProposal(proposal.planId);
      }
    },
    [proposals, approveProposal]
  );

  const handleRejectProposal = useCallback(
    (proposalId: string) => {
      const proposal = proposals.find((p) => p.id === proposalId);
      if (proposal?.planId) {
        rejectProposal(proposal.planId);
      }
    },
    [proposals, rejectProposal]
  );

  /**
   * Render proposal cards for a message that has proposalIds in its metadata.
   */
  const renderProposalCards = useCallback(
    (message: ChatMessage) => {
      const proposalIds = message.metadata?.proposalIds;
      if (!proposalIds || proposalIds.length === 0) return null;

      return (
        <div className="mt-3 space-y-2">
          {proposalIds.map((pid: string) => {
            // Look up the proposal data from our hook or build a basic card
            const proposalData = proposals.find((p) => p.id === pid);
            if (proposalData) {
              // Convert ProposalCardData → ProposalCard for the component
              const card: ProposalCardType = {
                id: proposalData.id,
                type: mapProposalType(proposalData.type),
                title: proposalData.title,
                description: proposalData.description,
                riskLevel: proposalData.riskLevel,
                status: proposalData.status,
                details: {
                  ...proposalData.details,
                  affectedFiles: proposalData.affectedFiles,
                  steps: proposalData.steps,
                  estimatedImpact: proposalData.estimatedImpact,
                  canRollback: proposalData.canRollback,
                },
                timestamp: proposalData.timestamp,
              };
              return (
                <ProposalCardComponent
                  key={pid}
                  proposal={card}
                  onApprove={handleApproveProposal}
                  onReject={handleRejectProposal}
                />
              );
            }

            // Fallback: we have an ID but no data yet (may still be loading)
            return (
              <div
                key={pid}
                className="proposal-card border-l-accent animate-pulse-slow rounded-md border-l-2 bg-bg-secondary p-3"
              >
                <div className="text-xs text-text-muted">Loading proposal...</div>
              </div>
            );
          })}
        </div>
      );
    },
    [proposals, handleApproveProposal, handleRejectProposal]
  );

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Suggestion chips for empty state
  const suggestions = [
    'Help me understand this project',
    'Add a new feature',
    'Find and fix issues',
    'Write tests for my code',
  ];

  if (!isOpen) return null;

  return (
    <div className="ai-panel ai-panel-transition" style={{ width: `${width}px` }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/20">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-accent"
            >
              <path d="M7 1L1 5l6 4 6-4-6-4z" />
              <path d="M1 9l6 4 6-4" />
            </svg>
          </div>
          <span className="text-sm font-medium text-text-primary">AI Assistant</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Provider/Model Selector */}
          <select
            className="input-mono rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-secondary"
            value={`${activeProvider}::${activeModel}`}
            onChange={(e) => {
              const [provider, ...modelParts] = e.target.value.split('::');
              setActiveProvider(provider);
              setActiveModel(modelParts.join('::'));
            }}
          >
            {providers.map((p) =>
              p.models.map((m) => (
                <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                  {m.name}
                </option>
              )),
            )}
            {providers.length === 0 && (
              <option value="openai::gpt-4o">GPT-4o</option>
            )}
          </select>

          {/* Clear Chat */}
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={clearChat}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 4h10M5 4V2.5A.5.5 0 015.5 2h3a.5.5 0 01.5.5V4M11 4v7.5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 013 11.5V4" />
            </svg>
          </button>

          {/* Close Panel */}
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={onToggle}
            title="Close panel (Cmd+J)"
            aria-label="Close AI panel"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="ai-messages scrollbar-custom">
        {messages.length === 0 && !isThinking ? (
          /* Empty State */
          <div className="flex flex-1 flex-col items-center justify-center py-16">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
              >
                <path d="M16 4L4 10l12 6 12-6-12-6z" />
                <path d="M4 16l12 6 12-6" />
                <path d="M4 22l12 6 12-6" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              What would you like to build?
            </h3>
            <p className="mb-6 text-center text-sm text-text-muted">
              Ask me anything about your code, request changes, or start a new project.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-full border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-accent"
                  onClick={() => {
                    setInputValue(suggestion);
                    textareaRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message List */
          <>
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col message-fade-in">
                <div className={`ai-message ai-message-${message.role}`}>
                  {message.role === 'assistant' ? (
                    <div>
                      {message.metadata?.proposalIds && message.metadata.proposalIds.length > 0 && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-2xs text-accent">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 6h10M6 1v10" />
                          </svg>
                          Proposed {message.metadata.proposalIds.length} change{message.metadata.proposalIds.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                      {/* Render proposal cards inline after AI message */}
                      {renderProposalCards(message)}
                    </div>
                  ) : message.role === 'system' ? (
                    <span>{message.content}</span>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
                <div
                  className={`mt-1 px-1 text-xs text-text-muted ${
                    message.role === 'user' ? 'self-end' : message.role === 'system' ? 'self-center' : 'self-start'
                  }`}
                >
                  {formatTimestamp(message.timestamp)}
                  {message.metadata?.model && (
                    <span className="ml-2 opacity-60">{message.metadata.model}</span>
                  )}
                  {message.metadata?.proposalIds && message.metadata.proposalIds.length > 0 && (
                    <span className="ml-2 text-accent">
                      {message.metadata.proposalIds.length} proposal{message.metadata.proposalIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking Indicator — skeleton card while AI is thinking */}
            {isThinking && (
              <div className="message-fade-in ai-message ai-message-assistant">
                <div className="flex items-center gap-2">
                  <div className="thinking-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="text-xs text-text-muted">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-3">
        {/* Model Indicator */}
        <div className="mb-2 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-xs text-text-muted">
            {activeModel || 'No model selected'}
          </span>
          {isStreaming && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Writing
            </span>
          )}
        </div>

        {/* Input Row */}
        <div className="flex items-end gap-2">
          {/* Attachment Button */}
          <button
            className="btn-icon btn-ghost mb-0.5 rounded p-1.5"
            title="Attach file"
            aria-label="Attach file"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 11.5l7-7a2.12 2.12 0 00-3-3l-7 7a3.54 3.54 0 005 5l7-7a4.95 4.95 0 00-7-7l-7 7" />
            </svg>
          </button>

          {/* Textarea */}
          <div className="relative flex-1 panel-focus-ring rounded-lg">
            <textarea
              ref={textareaRef}
              data-ai-input
              className="input input-mono resize-none py-2 pl-3 pr-3 text-sm"
              placeholder="Ask me anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming || isThinking}
              style={{ maxHeight: '160px' }}
            />
          </div>

          {/* Send Button */}
          <button
            className="btn-primary mb-0.5 rounded-lg px-3 py-2"
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming || isThinking}
            aria-label="Send message"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="2" y1="8" x2="14" y2="8" />
              <polyline points="9,3 14,8 9,13" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Map ProposalCardData type to the ProposalCard type that the component expects.
 */
function mapProposalType(
  type: ProposalCardData['type']
): ProposalCardType['type'] {
  if (type === 'multi_step') return 'plan';
  return type;
}

export default AIPanel;
