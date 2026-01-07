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

        const response = await this.agent.invoke(input, { recursionLimit: 100,  } );
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
            systemPrompt: `You are a web automation agent. Follow user instructions exactly.

            RULES:
            - Only perform actions explicitly requested by the user
            - Do NOT invent or add extra steps
            - Only click/type if you are 100% certain it's the correct element
            - Match elements by EXACT text only
            - Use the EXACT selector from [selector: ...]
            - When instruction says "aguardo carregamento", call wait_for_page_load
            - If similar elements exist, prefer performing actions in elements like buttons, links, inputs, selects rather than child elements (spans, divs, etc)

            FINDING ELEMENTS:
            1. Call get_page_content to see available elements
            2. If target element NOT found, call get_more_elements to load more content
            3. Repeat get_page_content until element is found OR no new elements appear
            4. Only proceed with action when element is found with EXACT text match

            EXECUTING ACTION:
            1. Find element with EXACT matching text
            2. If found and certain, call action tool (element_click/element_type/element_select_option)
            3. If instruction mentions "aguardo" or similiar, call wait_for_page_load`,

            tools: Object.values(tools),

        });
    }

    private async launchBrowser(): Promise<void> {
        const puppeteer = new BrowserInstance();
        await puppeteer.createBrowserInstance();
        this.browserInstance = puppeteer.browserInstance;
    }

}