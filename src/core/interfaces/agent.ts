export interface Agent{
    invoke(input: { messages: { role: string; content: string }[] }): Promise<{ structuredResponse?: any }>;
    create(): Promise<void>;
    destroy(): Promise<void>;
}