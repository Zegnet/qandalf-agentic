import { Subject } from 'rxjs';
import { randomUUID } from 'crypto';
import { AgentNavigator } from 'src/core/agents/navigator/agent-navigator';

export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

export class SseSession {
  private readonly _id: string;
  private readonly _subject: Subject<MessageEvent>;
  private readonly _createdAt: Date;
  private _lastActivityAt: Date;
  private _agent: AgentNavigator | undefined;

  constructor(id?: string) {
    this._id = id ?? randomUUID();
    this._subject = new Subject<MessageEvent>();
    this._createdAt = new Date();
    this._lastActivityAt = new Date();
  }

  get id(): string {
    return this._id;
  }

  get subject(): Subject<MessageEvent> {
    return this._subject;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get lastActivityAt(): Date {
    return this._lastActivityAt;
  }

  set agent(agent: AgentNavigator) {
    this._agent = agent;
  }

  get agent(): AgentNavigator | undefined {
    return this._agent;
  }

  sendMessage(data: string | object, type?: string): void {
    this._lastActivityAt = new Date();
    const event: MessageEvent = {
      data: typeof data === 'object' ? JSON.stringify(data) : data,
      id: randomUUID(),
      type,
    };
    this._subject.next(event);
  }

  complete(): void {
    this._subject.complete();
  }

  isActive(): boolean {
    return !this._subject.closed;
  }
}
