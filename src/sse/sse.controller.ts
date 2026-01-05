import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SseService } from './sse.service';
import { CreateSessionResponseDto } from './dtos/create-session-response.dto';
import { SseMessageDto } from './dtos/sse-message.dto';

@Controller('sse')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Post()
  createSession(): CreateSessionResponseDto {
    const session = this.sseService.createSession();
    return new CreateSessionResponseDto(session.id, session.createdAt);
  }

  @Sse(':sessionId')
  subscribe(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    return this.sseService.subscribe(sessionId).pipe(
      map((event) => ({
        data: event.data,
        id: event.id,
        type: event.type,
      })),
    );
  }
}
