// VibeCode System Kernel - Session Provider v8.0
// Manages user sessions with secure token handling and session persistence

import { EventEmitter } from 'events';

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  metadata?: Record<string, unknown>;
}

export interface SessionConfig {
  maxIdleTimeMs: number;
  maxSessionDurationMs: number;
  persistToDisk: boolean;
}

const DEFAULT_CONFIG: SessionConfig = {
  maxIdleTimeMs: 30 * 60 * 1000, // 30 minutes
  maxSessionDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  persistToDisk: true,
};

export class SessionProvider extends EventEmitter {
  private currentSession: Session | null = null;
  private config: SessionConfig;
  private idleTimer: NodeJS.Timeout | null = null;
  private durationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async createSession(userId: string, metadata?: Record<string, unknown>): Promise<Session> {
    this.clearTimers();

    const session: Session = {
      id: this.generateSessionId(),
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata,
    };

    this.currentSession = session;
    this.startIdleTimer();
    this.startDurationTimer();
    this.emit('session:created', session);

    return session;
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  async refreshSession(): Promise<boolean> {
    if (!this.currentSession) return false;

    this.currentSession.lastActivity = Date.now();
    this.startIdleTimer(); // Reset idle timer on activity
    this.emit('session:refreshed', this.currentSession);
    return true;
  }

  async endSession(): Promise<void> {
    if (!this.currentSession) return;

    const endedSession = this.currentSession;
    this.clearTimers();
    this.currentSession = null;
    this.emit('session:ended', endedSession);
  }

  isSessionValid(): boolean {
    if (!this.currentSession) return false;
    
    const now = Date.now();
    const idleTime = now - this.currentSession.lastActivity;
    const duration = now - this.currentSession.createdAt;

    return idleTime < this.config.maxIdleTimeMs && duration < this.config.maxSessionDurationMs;
  }

  getConfig(): SessionConfig {
    return { ...this.config };
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private startIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.emit('session:idle-timeout', this.currentSession);
      this.endSession();
    }, this.config.maxIdleTimeMs);
  }

  private startDurationTimer(): void {
    if (this.durationTimer) clearTimeout(this.durationTimer);
    this.durationTimer = setTimeout(() => {
      this.emit('session:duration-timeout', this.currentSession);
      this.endSession();
    }, this.config.maxSessionDurationMs);
  }

  private clearTimers(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
  }
}

// Singleton
let instance: SessionProvider | null = null;

export function getSessionProvider(config?: Partial<SessionConfig>): SessionProvider {
  if (!instance) {
    instance = new SessionProvider(config);
  }
  return instance;
}

export function resetSessionProvider(): void {
  if (instance) {
    instance.endSession();
  }
  instance = null;
}
