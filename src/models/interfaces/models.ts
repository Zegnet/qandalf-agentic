import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export enum ModelProvider {
    OPENAI = "openai",
    AZURE_OPENAI = "azure_openai",
}

export interface ModelConfig {
    provider: ModelProvider;
    model?: string;
    temperature?: number;
}

export abstract class Models {
    protected config: ModelConfig | undefined;

    constructor(config?: ModelConfig) {
        this.config = config;
    }

    abstract getModel(): BaseChatModel;
    abstract getProvider(): ModelProvider;
}