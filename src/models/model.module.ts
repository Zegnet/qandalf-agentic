import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ModelFactory } from './model.factory';
import { Logger } from '@nestjs/common';

@Global()
@Module({
    providers: [
        {
            provide: 'MODEL_FACTORY',
            useFactory: () => ModelFactory.getInstance(),
        },
    ],
    exports: ['MODEL_FACTORY'],
})
export class ModelModule implements OnModuleInit {
    private readonly logger = new Logger(ModelModule.name);

    onModuleInit() {
        try {
            const factory = ModelFactory.getInstance();
            const model = factory.getModel();
            this.logger.log(`Model initialized successfully: ${model.constructor.name}`);
        } catch (error) {
            this.logger.error('Failed to initialize model', error);
            throw error;
        }
    }
}