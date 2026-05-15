import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, AIMode, ProposalCard as ProposalCardType, ProposalCardData } from '../types';
import { useAIChat } from '../hooks/useAIChat';
import { useProposals } from '../hooks/useProposals';
import ProposalCardComponent from './ProposalCard';

interface AIPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width?: number;
}

const AI_MODES: { id: AIMode; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'edit', label: 'Edit', icon: '✏️' },
  { id: 'agent', label: 'Agent', icon: '🤖' },
  { id: 'architect', label: 'Architect', icon: '🏗' },
];

const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onToggle, width = 380 }) => {
  const {
    proposals,
    approve: approveProposal,
    reject: rejectProposal,
  } = useProposals();

  const handleStreamingComplete = useCallback(
    async (response: string, messageId: string) => {
      if (!window.vibecode?.proposal) return;
      try {
        const result = await window.vibecode.proposal.generateFromResponse(response);
        if (result.success && result.data?.proposals && result.data.proposals.length > 0) {
          const proposalIds = result.data.proposals.map((p: ProposalCardData) => p.id);
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
    cancelStreaming,
    streamingMetrics,
    activeProvider,
    activeModel,
    providers,
    setActiveProvider,
    setActiveModel,
    clearChat,
  } = useAIChat(handleStreamingComplete);

  const [inputValue, setInputValue] = useState('');
  const [aiMode, setAiMode] = useState<AIMode>('chat');
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
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

  const renderProposalCards = useCallback(
    (message: ChatMessage) => {
      const proposalIds = message.metadata?.proposalIds;
      if (!proposalIds || proposalIds.length === 0) return null;

      return (
        <div className="mt-3 space-y-2">
          {proposalIds.map((pid: string) => {
            const proposalData = proposals.find((p) => p.id === pid);
            if (proposalData) {
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
            return (
              <div
                key={pid}
                className="proposal-card border-l-accent animate-pulse-slow rounded-md border-l-2 bg-bg-elevated p-3"
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
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        {/* Mode Selector */}
        <div className="flex items-center gap-0.5 bg-bg-deep rounded-md p-0.5">
          {AI_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all duration-150 ${
                aiMode === mode.id
                  ? 'bg-bg-elevated text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setAiMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Provider/Model Selector */}
          <select
            className="rounded border border-border bg-bg-deep px-1.5 py-0.5 text-[10px] text-text-secondary font-mono"
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

          {/* Clear */}
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={clearChat}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 3h8M4 3V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M9 3v6.5A1.5 1.5 0 017.5 11h-3A1.5 1.5 0 013 9.5V3" />
            </svg>
          </button>

          {/* Close */}
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={onToggle}
            title="Close panel (⌘J)"
            aria-label="Close AI panel"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="ai-messages">
        {messages.length === 0 && !isThinking ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-accent">
                <path d="M12 3L3 8l9 5 9-5-9-5z" />
                <path d="M3 12l9 5 9-5" />
                <path d="M3 16l9 5 9-5" />
              </svg>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              What would you like to build?
            </h3>
            <p className="mb-4 text-center text-xs text-text-muted max-w-[200px]">
              Ask me anything about your code, request changes, or start a new project.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-[10px] text-text-secondary transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
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
          <>
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col message-fade-in">
                <div className={`ai-message ai-message-${message.role}`}>
                  {message.role === 'assistant' ? (
                    <div>
                      {message.metadata?.proposalIds && message.metadata.proposalIds.length > 0 && (
                        <div className="mb-1 flex items-center gap-1 text-[10px] text-accent">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 5h8M5 1v8" />
                          </svg>
                          Proposed {message.metadata.proposalIds.length} change{message.metadata.proposalIds.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                      {renderProposalCards(message)}
                    </div>
                  ) : message.role === 'system' ? (
                    <span>{message.content}</span>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  )}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="message-fade-in ai-message ai-message-assistant">
                <div className="flex items-center gap-2">
                  <div className="thinking-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="text-[10px] text-text-muted">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-[10px] text-text-muted font-mono">
            {activeModel || 'No model selected'}
          </span>
          {isStreaming && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Writing
              {streamingMetrics.tokensPerSecond > 0 && (
                <span className="text-text-muted ml-0.5">
                  {streamingMetrics.tokensPerSecond.toFixed(0)} tok/s
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="relative flex-1 rounded-md panel-focus-ring">
            <textarea
              ref={textareaRef}
              data-ai-input
              className="input input-mono resize-none py-2 pl-3 pr-3 text-xs"
              placeholder={`Ask ${aiMode === 'chat' ? 'anything' : aiMode === 'edit' ? 'to edit code' : aiMode === 'agent' ? 'the agent' : 'to architect'}...`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isThinking}
              style={{ maxHeight: '140px' }}
            />
          </div>

          {isStreaming ? (
            <button
              className="rounded-md bg-error/20 px-3 py-2 text-error transition-colors hover:bg-error/30"
              onClick={cancelStreaming}
              aria-label="Stop generating"
              title="Stop generating (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              className="btn-primary rounded-md px-3 py-2"
              onClick={handleSend}
              disabled={!inputValue.trim() || isThinking}
              aria-label="Send message"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="12" y2="7" />
                <polyline points="8,3 12,7 8,11" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function mapProposalType(type: ProposalCardData['type']): ProposalCardType['type'] {
  if (type === 'multi_step') return 'plan';
  return type;
}

export default AIPanel;
