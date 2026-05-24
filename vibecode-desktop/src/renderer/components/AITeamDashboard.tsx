// ============================================================
// VibeCode Desktop — ARC 22: AI Team Dashboard
// Product-level UI for viewing active agents, parallel tasks,
// agent discussions, execution approvals, and system confidence
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentIdentity {
  id: string;
  role: string;
  name: string;
  description: string;
  avatar: string;
}

interface AgentDashboardEntry {
  identity: AgentIdentity;
  status: string;
  currentTask: any | null;
  recentActions: any[];
  confidence: number;
  lastActivity: number;
}

interface AgentTask {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  assignedTo: string;
  status: string;
  confidence: number;
  createdAt: number;
}

interface AgentMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  priority: string;
  content: string;
  timestamp: number;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  riskLevel: string;
  votes: any[];
  status: string;
  createdAt: number;
}

interface OrgGoal {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number;
  status: string;
  progress: number;
  assignedAgents: string[];
}

interface DashboardMetrics {
  totalAgents: number;
  activeAgents: number;
  pendingTasks: number;
  activeProposals: number;
  avgConfidence: number;
  executionSuccessRate: number;
}

// ─── Status Colors ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: '#6b7280',
  thinking: '#f59e0b',
  planning: '#3b82f6',
  executing: '#10b981',
  waiting_approval: '#f97316',
  error: '#ef4444',
  suspended: '#9ca3af',
};

const ROLE_AVATARS: Record<string, string> = {
  architect: '\ud83c\udfd7\ufe0f',
  debug: '\ud83d\udd0d',
  research: '\ud83d\udcda',
  security: '\ud83d\udee1\ufe0f',
  performance: '\u26a1',
  product: '\u2728',
};

const RISK_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
};

// ─── Main Dashboard Component ───────────────────────────────────────────────

export const AITeamDashboard: React.FC = () => {
  const [agents, setAgents] = useState<AgentDashboardEntry[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [goals, setGoals] = useState<OrgGoal[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [autonomyLevel, setAutonomyLevel] = useState<string>('assisted');
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks' | 'proposals' | 'messages' | 'goals'>('agents');
  const [isRunning, setIsRunning] = useState(false);

  // ─── Data Loading ─────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      const result = await window.vibecode.agent.getDashboard();
      if (result.success && result.data) {
        setAgents(result.data.agents ?? []);
        setTasks(result.data.activeTasks ?? []);
        setMessages(result.data.recentMessages ?? []);
        setProposals(result.data.activeProposals ?? []);
        setGoals(result.data.activeGoals ?? []);
        setMetrics(result.data.systemMetrics ?? null);
        setAutonomyLevel(result.data.autonomyLevel ?? 'assisted');
      }
    } catch (err) {
      console.error('[AITeamDashboard] Failed to load dashboard:', err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 3000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Subscribe to real-time events
  useEffect(() => {
    const unsubOrch = window.vibecode.agent.onOrchestratorEvent(() => loadDashboard());
    const unsubComm = window.vibecode.agent.onCommunicationEvent(() => loadDashboard());
    const unsubVote = window.vibecode.agent.onVotingEvent(() => loadDashboard());
    const unsubOrg = window.vibecode.agent.onOrganizationEvent(() => loadDashboard());

    return () => {
      // Cleanup listeners are handled by IPC
    };
  }, [loadDashboard]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleStart = async () => {
    await window.vibecode.agent.start();
    setIsRunning(true);
    loadDashboard();
  };

  const handleStop = async () => {
    await window.vibecode.agent.stop();
    setIsRunning(false);
    loadDashboard();
  };

  const handleAutonomyChange = async (level: string) => {
    await window.vibecode.agent.setAutonomy(level);
    setAutonomyLevel(level);
    loadDashboard();
  };

  const handleVote = async (proposalId: string, vote: 'approve' | 'reject') => {
    await window.vibecode.agent.vote(proposalId, 'user', vote, `User ${vote}`, 1.0);
    loadDashboard();
  };

  // ─── Render Helpers ───────────────────────────────────────────────────

  const formatTime = (ts: number) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatTimeAgo = (ts: number) => {
    if (!ts) return 'never';
    const diff = Date.now() - ts;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>AI Team</h2>
          {metrics && (
            <div style={styles.metrics}>
              <span style={styles.metricBadge}>
                {metrics.activeAgents}/{metrics.totalAgents} active
              </span>
              <span style={styles.metricBadge}>
                {metrics.pendingTasks} tasks
              </span>
              <span style={styles.metricBadge}>
                {Math.round(metrics.executionSuccessRate * 100)}% success
              </span>
            </div>
          )}
        </div>
        <div style={styles.headerRight}>
          {/* Autonomy Control */}
          <select
            value={autonomyLevel}
            onChange={e => handleAutonomyChange(e.target.value)}
            style={styles.select}
          >
            <option value="supervised">Supervised</option>
            <option value="assisted">Assisted</option>
            <option value="autonomous">Autonomous</option>
          </select>
          {/* Start/Stop */}
          {!isRunning ? (
            <button onClick={handleStart} style={styles.startBtn}>Start Team</button>
          ) : (
            <button onClick={handleStop} style={styles.stopBtn}>Stop Team</button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabs}>
        {(['agents', 'tasks', 'proposals', 'messages', 'goals'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.activeTab : {}),
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'proposals' && proposals.length > 0 && (
              <span style={styles.badge}>{proposals.length}</span>
            )}
            {tab === 'tasks' && tasks.length > 0 && (
              <span style={styles.badge}>{tasks.filter(t => t.status === 'in_progress').length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.content}>
        {activeTab === 'agents' && <AgentsTab agents={agents} formatTimeAgo={formatTimeAgo} />}
        {activeTab === 'tasks' && <TasksTab tasks={tasks} />}
        {activeTab === 'proposals' && (
          <ProposalsTab proposals={proposals} onVote={handleVote} formatTime={formatTime} />
        )}
        {activeTab === 'messages' && <MessagesTab messages={messages} formatTime={formatTime} />}
        {activeTab === 'goals' && <GoalsTab goals={goals} />}
      </div>
    </div>
  );
};

// ─── Agents Tab ─────────────────────────────────────────────────────────────

const AgentsTab: React.FC<{
  agents: AgentDashboardEntry[];
  formatTimeAgo: (ts: number) => string;
}> = ({ agents, formatTimeAgo }) => (
  <div style={styles.grid}>
    {agents.length === 0 ? (
      <div style={styles.empty}>No agents spawned. Start the team to activate agents.</div>
    ) : (
      agents.map(agent => (
        <div key={agent.identity.id} style={styles.agentCard}>
          <div style={styles.agentHeader}>
            <span style={styles.agentAvatar}>
              {ROLE_AVATARS[agent.identity.role] || '\ud83e\udd16'}
            </span>
            <div style={styles.agentInfo}>
              <div style={styles.agentName}>{agent.identity.name}</div>
              <div style={styles.agentRole}>{agent.identity.role}</div>
            </div>
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: STATUS_COLORS[agent.status] || '#6b7280',
              }}
            />
          </div>
          <div style={styles.agentBody}>
            <div style={styles.agentStatus}>
              Status: <strong>{agent.status}</strong>
            </div>
            {agent.currentTask && (
              <div style={styles.currentTask}>
                Working on: {agent.currentTask.title}
              </div>
            )}
            <div style={styles.agentMeta}>
              Confidence: {Math.round(agent.confidence * 100)}% |
              Last active: {formatTimeAgo(agent.lastActivity)}
            </div>
          </div>
        </div>
      ))
    )}
  </div>
);

// ─── Tasks Tab ──────────────────────────────────────────────────────────────

const TasksTab: React.FC<{ tasks: AgentTask[] }> = ({ tasks }) => (
  <div style={styles.list}>
    {tasks.length === 0 ? (
      <div style={styles.empty}>No active tasks.</div>
    ) : (
      tasks.map(task => (
        <div key={task.id} style={styles.taskCard}>
          <div style={styles.taskHeader}>
            <span style={styles.taskType}>{task.type}</span>
            <span style={{ ...styles.riskBadge, backgroundColor: RISK_COLORS[task.riskLevel] || '#6b7280' }}>
              {task.priority}
            </span>
          </div>
          <div style={styles.taskTitle}>{task.title}</div>
          <div style={styles.taskMeta}>
            Agent: {task.assignedTo} | Status: {task.status} | Confidence: {Math.round(task.confidence * 100)}%
          </div>
        </div>
      ))
    )}
  </div>
);

// ─── Proposals Tab ──────────────────────────────────────────────────────────

const ProposalsTab: React.FC<{
  proposals: Proposal[];
  onVote: (id: string, vote: 'approve' | 'reject') => void;
  formatTime: (ts: number) => string;
}> = ({ proposals, onVote, formatTime }) => (
  <div style={styles.list}>
    {proposals.length === 0 ? (
      <div style={styles.empty}>No active proposals pending.</div>
    ) : (
      proposals.map(proposal => (
        <div key={proposal.id} style={styles.proposalCard}>
          <div style={styles.proposalHeader}>
            <span style={styles.proposalTitle}>{proposal.title}</span>
            <span style={{ ...styles.riskBadge, backgroundColor: RISK_COLORS[proposal.riskLevel] || '#6b7280' }}>
              {proposal.riskLevel}
            </span>
          </div>
          <div style={styles.proposalDesc}>{proposal.description}</div>
          <div style={styles.proposalMeta}>
            Proposed by: {proposal.proposedBy} | Votes: {proposal.votes.length} | {formatTime(proposal.createdAt)}
          </div>
          <div style={styles.proposalVotes}>
            {proposal.votes.map((vote: any, idx: number) => (
              <span
                key={idx}
                style={{
                  ...styles.voteChip,
                  backgroundColor: vote.vote === 'approve' ? '#d1fae5' : vote.vote === 'reject' ? '#fee2e2' : '#f3f4f6',
                  color: vote.vote === 'approve' ? '#065f46' : vote.vote === 'reject' ? '#991b1b' : '#374151',
                }}
              >
                {vote.agentId}: {vote.vote}
              </span>
            ))}
          </div>
          {proposal.status === 'debating' && (
            <div style={styles.proposalActions}>
              <button
                onClick={() => onVote(proposal.id, 'approve')}
                style={styles.approveBtn}
              >
                Approve
              </button>
              <button
                onClick={() => onVote(proposal.id, 'reject')}
                style={styles.rejectBtn}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))
    )}
  </div>
);

// ─── Messages Tab ───────────────────────────────────────────────────────────

const MessagesTab: React.FC<{
  messages: AgentMessage[];
  formatTime: (ts: number) => string;
}> = ({ messages, formatTime }) => (
  <div style={styles.list}>
    {messages.length === 0 ? (
      <div style={styles.empty}>No messages yet.</div>
    ) : (
      messages.slice().reverse().map(msg => (
        <div key={msg.id} style={styles.messageCard}>
          <div style={styles.messageHeader}>
            <span style={styles.messageFrom}>{ROLE_AVATARS[msg.from] || '\ud83e\udd16'} {msg.from}</span>
            <span style={styles.messageArrow}>
              {msg.to === 'broadcast' ? '\u2192 all' : `\u2192 ${msg.to}`}
            </span>
            <span style={styles.messageType}>{msg.type}</span>
            <span style={styles.messageTime}>{formatTime(msg.timestamp)}</span>
          </div>
          <div style={styles.messageContent}>{msg.content}</div>
        </div>
      ))
    )}
  </div>
);

// ─── Goals Tab ──────────────────────────────────────────────────────────────

const GoalsTab: React.FC<{ goals: OrgGoal[] }> = ({ goals }) => (
  <div style={styles.list}>
    {goals.length === 0 ? (
      <div style={styles.empty}>No active goals.</div>
    ) : (
      goals.map(goal => (
        <div key={goal.id} style={styles.goalCard}>
          <div style={styles.goalHeader}>
            <span style={styles.goalType}>{goal.type}</span>
            <span style={styles.goalPriority}>Priority: {goal.priority}</span>
          </div>
          <div style={styles.goalTitle}>{goal.title}</div>
          <div style={styles.goalDesc}>{goal.description}</div>
          <div style={styles.goalProgress}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${Math.round(goal.progress * 100)}%` }} />
            </div>
            <span style={styles.progressText}>{Math.round(goal.progress * 100)}%</span>
          </div>
          <div style={styles.goalAgents}>
            Agents: {goal.assignedAgents.join(', ')}
          </div>
        </div>
      ))
    )}
  </div>
);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1e293b',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    color: '#f8fafc',
  },
  metrics: {
    display: 'flex',
    gap: '8px',
  },
  metricBadge: {
    padding: '2px 8px',
    borderRadius: '10px',
    backgroundColor: '#1e293b',
    fontSize: '11px',
    color: '#94a3b8',
  },
  select: {
    padding: '4px 8px',
    borderRadius: '6px',
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    fontSize: '12px',
  },
  startBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  stopBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  tabs: {
    display: 'flex',
    padding: '0 16px',
    borderBottom: '1px solid #1e293b',
  },
  tab: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    position: 'relative' as const,
  },
  activeTab: {
    color: '#60a5fa',
    borderBottomColor: '#60a5fa',
  },
  badge: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    padding: '0 4px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '32px',
    color: '#64748b',
    fontSize: '14px',
  },
  // Agent card
  agentCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #334155',
  },
  agentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  agentAvatar: {
    fontSize: '24px',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontWeight: 600,
    fontSize: '14px',
  },
  agentRole: {
    fontSize: '11px',
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  agentBody: {
    fontSize: '12px',
  },
  agentStatus: {
    marginBottom: '4px',
  },
  currentTask: {
    color: '#60a5fa',
    marginBottom: '4px',
  },
  agentMeta: {
    color: '#64748b',
    fontSize: '11px',
  },
  // Task card
  taskCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #334155',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  taskType: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#334155',
    color: '#94a3b8',
  },
  taskTitle: {
    fontWeight: 600,
    fontSize: '13px',
    marginBottom: '4px',
  },
  taskMeta: {
    color: '#64748b',
    fontSize: '11px',
  },
  riskBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#fff',
  },
  // Proposal card
  proposalCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #334155',
  },
  proposalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  proposalTitle: {
    fontWeight: 600,
    fontSize: '13px',
  },
  proposalDesc: {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '8px',
  },
  proposalMeta: {
    color: '#64748b',
    fontSize: '11px',
    marginBottom: '8px',
  },
  proposalVotes: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
    marginBottom: '8px',
  },
  voteChip: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
  },
  proposalActions: {
    display: 'flex',
    gap: '8px',
  },
  approveBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
  },
  rejectBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
  },
  // Message card
  messageCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '8px 12px',
    border: '1px solid #334155',
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontSize: '11px',
  },
  messageFrom: {
    fontWeight: 600,
  },
  messageArrow: {
    color: '#64748b',
  },
  messageType: {
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: '#334155',
    fontSize: '10px',
  },
  messageTime: {
    color: '#475569',
    marginLeft: 'auto',
  },
  messageContent: {
    fontSize: '12px',
    color: '#cbd5e1',
  },
  // Goal card
  goalCard: {
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid #334155',
  },
  goalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  goalType: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#334155',
    color: '#94a3b8',
  },
  goalPriority: {
    fontSize: '11px',
    color: '#64748b',
  },
  goalTitle: {
    fontWeight: 600,
    fontSize: '13px',
    marginBottom: '4px',
  },
  goalDesc: {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '8px',
  },
  goalProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  progressBar: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    backgroundColor: '#334155',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 600,
  },
  goalAgents: {
    fontSize: '11px',
    color: '#64748b',
  },
};

export default AITeamDashboard;
