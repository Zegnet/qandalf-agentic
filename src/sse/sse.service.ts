import { Injectable, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseSession, MessageEvent } from './sse.session';

@Injectable()
export class SseService {
  private readonly sessions: Map<string, SseSession> = new Map();

  createSession(): SseSession {
    const session = new SseSession();
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): SseSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionOrThrow(sessionId: string): SseSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with id ${sessionId} not found`);
    }
    return session;
  }

  subscribe(sessionId: string): Observable<MessageEvent> {
    const session = this.getSessionOrThrow(sessionId);
    return session.subject.asObservable();
  }

  sendMessage(sessionId: string, data: string | object, type?: string): void {
    const session = this.getSessionOrThrow(sessionId);
    session.sendMessage(data, type);
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.complete();
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  getAllSessions(): SseSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}
