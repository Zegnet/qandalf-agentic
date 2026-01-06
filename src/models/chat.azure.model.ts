import { AzureChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Models, ModelConfig, ModelProvider } from "./interfaces/models";


export class AzureOpenAIModel extends Models {
    private model: AzureChatOpenAI | undefined;

    constructor(config?: Partial<ModelConfig>) {
        super({
            provider: ModelProvider.AZURE_OPENAI,
            model: config?.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
            temperature: config?.temperature || 0.7,
        });
    }

    getModel(): BaseChatModel {
        if (!this.model) {
            this.model = new AzureChatOpenAI({
                azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
                azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
                azureOpenAIApiDeploymentName: this.config?.model,
                azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
                temperature: this.config?.temperature,
            });
        }
        return this.model;
    }

    getProvider(): ModelProvider {
        return ModelProvider.AZURE_OPENAI;
    }
}