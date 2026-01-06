import { createAgent, initChatModel, ReactAgent, toolStrategy } from "langchain";
import { BrowserInstance } from "./browser";
import { createNavigatorTools } from "./browserContext";
import { Inject, Injectable, Logger } from "@nestjs/common";
import * as z from "zod";
import { Browser, Page } from "puppeteer";
import { Agent } from "src/core/interfaces/agent";
import { AzureChatOpenAI, AzureOpenAI, ChatOpenAI } from "@langchain/openai";
import { ModelFactory } from "src/models/model.factory";

const navigationResponseSchema = z.object({
    action: z.string().describe("The action executed by the agent."),
    result: z.string().describe("The result of the action executed."),
    cssSelector: z.string().optional().describe("The CSS selector used, if applicable."),
});

type NavigationResponse = z.infer<typeof navigationResponseSchema>;        

@Injectable()
export class AgentNavigator implements Agent{
    private agent: ReactAgent | undefined;
    private browserInstance: {browser: Browser; page: Page } | undefined;

    constructor(
        @Inject('MODEL_FACTORY') private readonly modelFactory: ModelFactory,
    ) {}

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

        const model = this.modelFactory.getModel();

        this.agent = createAgent({
            model,
            systemPrompt: `You are a navigation agent that helps users interact with web pages.

                ELEMENT SELECTION RULES:
                - When asked to click or interact with an element, use 'get_page_content' to see available elements.
                - Each element is listed as: [index] <tag> "text content" [selector: CSS_SELECTOR]
                - Search for EXACT TEXT MATCH. The element text must match EXACTLY what the user requested.
                - Do NOT use partial matching, contains, or semantic similarity to find elements.
                - Example: If user says "click on Pesquisa de Cliente", find ONLY the element with EXACT text "Pesquisa de Cliente".
                - Use the EXACT selector provided in [selector: ...] for element_click or element_type tools.
                - If multiple elements have the exact same text, prefer buttons over divs, and elements without [parent: X].

                EXECUTION RULES:
                - Execute the minimum number of actions needed to complete the task.
                - Call 'get_page_content' FIRST to identify available elements before any interaction.
                - After finding the target element, use element_click with its exact selector.
                - After clicking a button or navigating, wait for the page to load before proceeding.
                - If page has few elements (less than 10), the page might still be loading - wait and try get_page_content again.
                - Don't click on elements that are not necessary to complete the task.
                - If user request a wait or delay, use the wait tool 'wait_for_timeout' 5000 milliseconds.

                SELECTOR USAGE:
                - Always use the complete selector exactly as shown in [selector: ...].
                - For elements marked [shadow-dom], the selector may be simpler (like #id) - use it as provided.
                - Never modify or simplify the selectors.`,
            tools: Object.values(tools),

        });
    }

    private async launchBrowser(): Promise<void> {
        const puppeteer = new BrowserInstance();
        await puppeteer.createBrowserInstance();
        this.browserInstance = puppeteer.browserInstance;
    }

}