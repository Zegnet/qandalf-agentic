import { createAgent, ReactAgent, toolStrategy } from "langchain";
import { BrowserInstance } from "./browser";
import { createNavigatorTools } from "./browserContext";
import { Logger } from "@nestjs/common";
import * as z from "zod";
import { Browser, Page } from "puppeteer";
import { Agent } from "src/core/interfaces/agent";

const navigationResponseSchema = z.object({
    action: z.string().describe("The action executed by the agent."),
    result: z.string().describe("The result of the action executed."),
    cssSelector: z.string().optional().describe("The CSS selector used, if applicable."),
});

type NavigationResponse = z.infer<typeof navigationResponseSchema>;        

export class AgentNavigator implements Agent{
    private agent: ReactAgent | undefined;
    private browserInstance: {browser: Browser; page: Page } | undefined;
    
    public static async Instance(): Promise<AgentNavigator> {
        const navigator = new AgentNavigator();
        await navigator.create();
        return navigator;
    }

    async invoke(input: { messages: { role: string; content: string; }[]; }): Promise<{ structuredResponse?: any; }> {
        if (!this.agent) {
            throw new Error("Agent not initialized");
        }

        const response = await this.agent.invoke(input);
        return { structuredResponse: response?.structuredResponse };
    }

    async create(): Promise<void> {
        if (!this.browserInstance) {
            await this.launchBrowser();
        }
        
        if (!this.agent && this.browserInstance) {
            await this.createAgent();
        }
    }

    async destroy(): Promise<void> {
        if (this.browserInstance) {
            await this.browserInstance.browser.close();
            this.browserInstance = undefined;
            this.agent = undefined;
        }
    }

    private async createAgent(): Promise<void> {
        if (!this.browserInstance) {
            throw new Error("Browser instance not available");
        }

        const tools = createNavigatorTools({
            browser: this.browserInstance.browser,
            page: this.browserInstance.page,
            logger: new Logger('NavigatorAgent'),
        });

        this.agent = createAgent({
            model: process.env.MODEL || "gpt-4o",
            systemPrompt: `You are a navigation agent that helps users navigate the web.

            IMPORTANT RULES:
            - Execute the minimum number of actions needed to complete the task.
            - After navigating to a URL, the task is COMPLETE. Do not call additional tools unless explicitly requested.
            - Each action in page elements you should call 'get_page_content' tool to get the current state of the page and identify elements available to interact with.
            - Respond immediately after completing the requested action.`,
            tools: Object.values(tools),
            responseFormat: toolStrategy(navigationResponseSchema),
        });
    }

    private async launchBrowser(): Promise<void> {
        const puppeteer = new BrowserInstance();
        await puppeteer.createBrowserInstance();
        this.browserInstance = puppeteer.browserInstance;
    }

}