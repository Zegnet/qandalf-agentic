import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { OpenAIModel } from "./chat.openai.model";
import { AzureOpenAIModel } from "./chat.azure.model";
import { Logger } from "@nestjs/common";
import { Models, ModelProvider, ModelConfig } from "./interfaces/models";

export class ModelFactory {
    private static instance: ModelFactory;
    private modelInstance: Models | undefined;
    private readonly logger = new Logger(ModelFactory.name);

    private constructor() {}

    public static getInstance(): ModelFactory {
        if (!ModelFactory.instance) {
            ModelFactory.instance = new ModelFactory();
        }
        return ModelFactory.instance;
    }

    private detectProvider(): ModelProvider {
        if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
            this.logger.log('Azure OpenAI detected from environment');
            return ModelProvider.AZURE_OPENAI;
        }
        
        if (process.env.OPENAI_API_KEY) {
            this.logger.log('OpenAI detected from environment');
            return ModelProvider.OPENAI;
        }

        throw new Error('No valid AI provider configuration found in environment variables');
    }

    public createModel(config?: Partial<ModelConfig>): Models {
        const provider = config?.provider || this.detectProvider();

        switch (provider) {
            case ModelProvider.AZURE_OPENAI:
                return new AzureOpenAIModel(config);
            case ModelProvider.OPENAI:
                return new OpenAIModel(config);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    public getModel(config?: Partial<ModelConfig>): BaseChatModel {
        if (!this.modelInstance) {
            this.modelInstance = this.createModel(config);
        }
        return this.modelInstance.getModel();
    }

    public resetModel(): void {
        this.modelInstance = undefined;
    }
}