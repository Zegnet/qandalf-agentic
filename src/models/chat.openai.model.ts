import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Models, ModelConfig, ModelProvider } from "./interfaces/models";

export class OpenAIModel extends Models {
    private model: ChatOpenAI | undefined;

    constructor(config?: Partial<ModelConfig>) {
        super({
            provider: ModelProvider.OPENAI,
            model: config?.model || process.env.OPENAI_MODEL || 'gpt-4-turbo',
            temperature: config?.temperature || 0.7,
        });
    }

    getProvider(): ModelProvider {
        return ModelProvider.OPENAI;
    }

    getModel(): BaseChatModel {
        if(!this.model){
            this.model = new ChatOpenAI({
                model: this.config?.model,
                temperature: this.config?.temperature,
                apiKey: process.env.OPENAI_API_KEY,
            });
        }
        
        return this.model;
    }

}