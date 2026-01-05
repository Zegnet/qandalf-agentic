import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [ 
    ConfigModule.forRoot({
      envFilePath: ['.env', '.dev.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      isGlobal: true,
    }),
    SseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
