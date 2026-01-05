import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AppService } from '../app/app.service';
import { AgentDTO } from './dtos/agent.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  execute(@Body() body: AgentDTO): void {
    this.appService.execute(body.sessionId, body.task);
  }
}
