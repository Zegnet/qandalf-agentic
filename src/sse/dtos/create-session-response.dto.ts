export class CreateSessionResponseDto {
  sessionId: string;
  createdAt: Date;

  constructor(sessionId: string, createdAt: Date) {
    this.sessionId = sessionId;
    this.createdAt = createdAt;
  }
}
