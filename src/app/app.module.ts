import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SseModule } from '../sse/sse.module';
import { ModelModule } from 'src/models/model.module';
import { AgentNavigator } from 'src/core/agents/navigator/agent-navigator';

@Module({
  imports: [ 
    ConfigModule.forRoot({
      envFilePath: ['.env', '.dev.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      isGlobal: true,
    }),
    SseModule,
    ModelModule
  ],
  controllers: [AppController],
  providers: [AppService, AgentNavigator],
})
export class AppModule {}
