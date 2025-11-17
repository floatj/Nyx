import 'dotenv/config';
import { randomBytes } from 'crypto';
import type { Session, SessionResponse } from '../types/index.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private readonly defaultBudget = parseInt(process.env.TOKEN_BUDGET_PER_SESSION || '20000');
  private readonly sessionExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Create a new anonymous session
   */
  createSession(): SessionResponse {
    const sessionId = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('hex');

    const session: Session = {
      id: sessionId,
      tokenUsed: 0,
      tokenBudget: this.defaultBudget,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // Clean up old sessions periodically
    this.cleanupExpiredSessions();

    return {
      sessionId,
      token,
      tokenBudget: this.defaultBudget,
      expiresIn: this.sessionExpiry / 1000, // seconds
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    if (Date.now() - session.lastActive > this.sessionExpiry) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session token usage
   */
  updateTokenUsage(sessionId: string, tokensUsed: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.tokenUsed += tokensUsed;
      session.lastActive = Date.now();
    }
  }

  /**
   * Check if session has budget remaining
   */
  hasTokenBudget(sessionId: string, requiredTokens: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return session.tokenUsed + requiredTokens <= session.tokenBudget;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActive > this.sessionExpiry) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Get session stats
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      totalSessions: this.sessions.size,
    };
  }
}

export const sessionManager = new SessionManager();
