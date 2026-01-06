import { Injectable, Logger } from '@nestjs/common';
import { AgentNavigator } from 'src/core/agents/navigator/agent-navigator';
import { SseService } from 'src/sse/sse.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger('NavigatorAgent');

  constructor(
    private sseService: SseService,
    private navigator: AgentNavigator
  ) {}
  
  async execute(uuid: string, task: string): Promise<void> {

    const steps = task.split(';');
    this.logger.log(`Executing task for session ${uuid}: ${steps.join('\n')}`);
    for(const step of steps) {
      
      const session = this.sseService.getSession(uuid);

      if (!session) {
        throw new Error(`Session with id ${uuid} not found`);
      }

      if(!session.agent) {
        await this.navigator.create();
        session.agent = this.navigator;
      }

      const response = await session.agent.invoke({
        messages: [{ role: "user", content: step }],
      });

      session.sendMessage(response.structuredResponse || 'No response from agent', 'message');
    }
  }
}
