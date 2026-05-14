import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, ProposalCard as ProposalCardType } from '../types';
import { useAIChat } from '../hooks/useAIChat';
import ProposalCardComponent from './ProposalCard';

interface AIPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onToggle }) => {
  const {
    messages,
    isStreaming,
    isThinking,
    sendMessage,
    activeProvider,
    activeModel,
    providers,
    setActiveProvider,
    setActiveModel,
    clearChat,
  } = useAIChat();

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

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Suggestion chips for empty state
  const suggestions = [
    'Create a new React component',
    'Explain this codebase',
    'Refactor for better performance',
    'Write unit tests',
  ];

  if (!isOpen) return null;

  return (
    <div className="ai-panel">
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
              <div key={message.id} className="flex flex-col">
                <div className={`ai-message ai-message-${message.role}`}>
                  {message.role === 'assistant' ? (
                    <div className="whitespace-pre-wrap">
                      {message.content}
                      {message.metadata?.proposalId && (
                        <ProposalCardComponent
                          proposal={{
                            id: message.metadata.proposalId,
                            type: 'file_edit',
                            title: 'Proposed Change',
                            description: 'AI-proposed modification',
                            riskLevel: 'low',
                            status: 'pending',
                            details: {},
                            timestamp: message.timestamp,
                          }}
                        />
                      )}
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
                </div>
              </div>
            ))}

            {/* Thinking Indicator */}
            {isThinking && (
              <div className="ai-message ai-message-assistant">
                <div className="thinking-dots">
                  <span />
                  <span />
                  <span />
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
            <span className="ml-auto text-xs text-accent">Streaming...</span>
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
          <div className="relative flex-1">
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

export default AIPanel;
