import React, { useState, useEffect, useCallback } from 'react';
import type { MemoryEntry, MemoryType } from '../../types';

const MEMORY_TYPE_CONFIG: Record<MemoryType, { label: string; color: string; bg: string }> = {
  conversation: { label: 'Conversation', color: 'text-accent', bg: 'bg-accent/10' },
  decision: { label: 'Decision', color: 'text-warning', bg: 'bg-warning/10' },
  preference: { label: 'Preference', color: 'text-info', bg: 'bg-info/10' },
  fact: { label: 'Fact', color: 'text-success', bg: 'bg-success/10' },
  pattern: { label: 'Pattern', color: 'text-accent-hover', bg: 'bg-accent-hover/10' },
  error: { label: 'Error', color: 'text-error', bg: 'bg-error/10' },
};

const IMPORTANCE_STARS = (importance: number) => {
  const filled = Math.round(importance);
  return Array.from({ length: 5 }, (_, i) => (
    <svg
      key={i}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill={i < filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1"
      className={i < filled ? 'text-warning' : 'text-border'}
    >
      <path d="M5 1l1.2 2.4 2.8.4-2 2 .5 2.8L5 7.2 2.5 8.6l.5-2.8-2-2 2.8-.4z" />
    </svg>
  ));
};

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const MemoryPanel: React.FC = () => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>('');

  const projectId = 'default';

  // Load memories
  useEffect(() => {
    const loadMemories = async () => {
      setIsLoading(true);
      try {
        const result = await window.vibecode?.memory.list(projectId);
        if (result) {
          setMemories(result);
        }
      } catch {
        // Memory not available
      } finally {
        setIsLoading(false);
      }
    };
    loadMemories();
  }, [projectId]);

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    const matchesType = filterType === 'all' || m.type === filterType;
    const matchesSearch =
      !searchQuery.trim() ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  // Group by type
  const groupedMemories = filteredMemories.reduce<Record<string, MemoryEntry[]>>(
    (acc, m) => {
      if (!acc[m.type]) acc[m.type] = [];
      acc[m.type].push(m);
      return acc;
    },
    {},
  );

  // Stats
  const stats = memories.reduce<Record<string, number>>((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1;
    return acc;
  }, {});

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const results = await window.vibecode?.memory.search(
        searchQuery,
        projectId,
        20,
      );
      if (results) {
        setMemories(results);
      }
    } catch {
      // Search failed
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, projectId]);

  const handleGenerateSummary = useCallback(async () => {
    try {
      const result = await window.vibecode?.memory.summarize(projectId);
      if (result) {
        setSummary(result);
      }
    } catch {
      setSummary('Failed to generate summary.');
    }
  }, [projectId]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await window.vibecode?.memory.delete(id);
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } catch {
        // Delete failed
      }
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Stats Bar */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">
            {memories.length} memories
          </span>
          <button
            className="btn btn-ghost btn-sm rounded text-xs"
            onClick={handleGenerateSummary}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 3h8M2 6h6M2 9h4" />
            </svg>
            Summarize
          </button>
        </div>
        {summary && (
          <div className="mt-2 rounded-md bg-bg-primary p-2 text-xs text-text-secondary">
            {summary}
          </div>
        )}
        {/* Type badges */}
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(stats).map(([type, count]) => {
            const config = MEMORY_TYPE_CONFIG[type as MemoryType];
            return (
              <button
                key={type}
                className={`badge ${config?.bg || 'bg-bg-hover'} ${config?.color || 'text-text-secondary'} cursor-pointer transition-opacity ${
                  filterType === type ? 'opacity-100' : 'opacity-60 hover:opacity-80'
                }`}
                onClick={() =>
                  setFilterType(filterType === type ? 'all' : (type as MemoryType))
                }
              >
                {config?.label || type}: {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="flex-shrink-0 text-text-muted"
          >
            <circle cx="6" cy="6" r="4" />
            <line x1="9" y1="9" x2="12" y2="12" />
          </svg>
          <input
            type="text"
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-custom">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="spinner" />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            {searchQuery ? 'No memories match your search' : 'No memories yet'}
          </div>
        ) : (
          Object.entries(groupedMemories).map(([type, entries]) => {
            const config = MEMORY_TYPE_CONFIG[type as MemoryType];
            return (
              <div key={type} className="mb-3">
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {config?.label || type}
                </div>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className="mb-1 cursor-pointer rounded-md border border-border bg-bg-tertiary p-2.5 transition-colors hover:border-accent/30"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : entry.id)
                      }
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Type badge */}
                          <span
                            className={`badge ${config?.bg || 'bg-bg-hover'} ${config?.color || 'text-text-secondary'} mb-1`}
                          >
                            {config?.label || type}
                          </span>
                          {/* Content preview */}
                          <p className="mt-1 truncate text-xs text-text-secondary">
                            {entry.summary || entry.content}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className="text-xs text-text-muted">
                            {formatRelativeTime(entry.timestamp)}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {IMPORTANCE_STARS(entry.importance)}
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      {entry.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted"
                            >
                              {tag}
                            </span>
                          ))}
                          {entry.tags.length > 3 && (
                            <span className="text-[10px] text-text-muted">
                              +{entry.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="mt-3 border-t border-border pt-3">
                          <p className="whitespace-pre-wrap text-xs text-text-primary leading-relaxed">
                            {entry.content}
                          </p>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-text-muted">
                              <span>
                                Accessed {entry.accessCount}x
                              </span>
                              <span>
                                Last: {formatRelativeTime(entry.lastAccessed)}
                              </span>
                            </div>
                            <button
                              className="text-xs text-error hover:text-error/80 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(entry.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MemoryPanel;
