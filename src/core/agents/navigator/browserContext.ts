import { Logger } from "@nestjs/common";
import { tool } from "langchain";
import { Browser, Frame, KeyInput, Page } from "puppeteer";
import * as z from "zod";
import { generatePdf, cleanupOldFiles } from "../../../utils/pdf-generator";

export interface BrowserContext {
    browser: Browser;
    page: Page;
    logger: Logger;
    currentFrame?: Frame;
}

export function createNavigatorTools(context: BrowserContext) {
    const { logger } = context;

    const navigate_to = tool(
        async (input) => {
            const startTime = Date.now();
            
            await context.page.goto(input.url, { waitUntil: "networkidle0" });
            
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] navigate_to | Duration: ${duration}ms`);
            
            return `Successfully navigated to ${input.url}`;
        },
        {
            name: "navigate_to",
            description: "Navigate to a specific URL. Input should be a JSON object with a 'url' field.",
            schema: z.object({
                url: z.string().describe("The URL to navigate to."),
            }),
        }
    );

    // Helper function to find element in both regular DOM and Shadow DOM
    async function findElementWithShadowDom(selector: string): Promise<boolean> {
        return await context.page.evaluate((sel) => {
            // Try regular querySelector first
            let element = document.querySelector(sel);
            if (element) return true;

            // If not found, search in shadow DOMs
            function searchInShadowDom(root: Document | ShadowRoot | Element): Element | null {
                // Try to find in current root
                const found = root.querySelector(sel);
                if (found) return found;

                // Search all shadow roots
                const allElements = root.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        const shadowResult = searchInShadowDom(el.shadowRoot);
                        if (shadowResult) return shadowResult;
                    }
                }
                return null;
            }

            element = searchInShadowDom(document);
            return element !== null;
        }, selector);
    }

    // Helper function to click element in Shadow DOM
    async function clickElementWithShadowDom(selector: string): Promise<void> {
        await context.page.evaluate((sel) => {
            function findElement(root: Document | ShadowRoot | Element): Element | null {
                const found = root.querySelector(sel);
                if (found) return found;

                const allElements = root.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        const shadowResult = findElement(el.shadowRoot);
                        if (shadowResult) return shadowResult;
                    }
                }
                return null;
            }

            const element = findElement(document) as HTMLElement;
            if (element) {
                element.click();
            } else {
                throw new Error(`Element not found: ${sel}`);
            }
        }, selector);
    }

    // Helper function to type into element in Shadow DOM
    async function typeIntoElementWithShadowDom(selector: string, text: string): Promise<void> {
        await context.page.evaluate((sel) => {
            function findElement(root: Document | ShadowRoot | Element): Element | null {
                const found = root.querySelector(sel);
                if (found) return found;

                const allElements = root.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        const shadowResult = findElement(el.shadowRoot);
                        if (shadowResult) return shadowResult;
                    }
                }
                return null;
            }

            const element = findElement(document) as HTMLElement;
            if (element) {
                element.focus();
            } else {
                throw new Error(`Element not found: ${sel}`);
            }
        }, selector);
        
        // Type using keyboard after focusing
        await context.page.keyboard.type(text, { delay: 100 });
    }

    const element_type = tool(
        async (input) => {
            const startTime = Date.now();
            await removeHighlight(context);
            
            // Use frame context if set, otherwise use main page
            const targetContext = context.currentFrame || context.page;
            
            // Try regular selector first, fallback to shadow DOM search
            try {
                await targetContext.waitForSelector(input.selector, { visible: true, timeout: 2000 });
                await highlight(context, input.selector);
                await targetContext.click(input.selector);
                await targetContext.type(input.selector, input.text, { delay: 100 });
            } catch {
                // Element might be in Shadow DOM
                const found = await findElementWithShadowDom(input.selector);
                if (!found) {
                    throw new Error(`Element not found: ${input.selector}`);
                }
                await highlight(context, input.selector);
                await typeIntoElementWithShadowDom(input.selector, input.text);
            }
            
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] element_type | Duration: ${duration}ms | Selector: ${input.selector}`);
            return `Typed text into element with selector ${input.selector}`;
        },
        {
            name: "element_type",
            description: "Type text into an element specified by a CSS selector. Input should be a JSON object with 'selector' and 'text' fields. Supports elements inside Shadow DOM.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the element to type into."),
                text: z.string().describe("The text to type into the element."),
            }),
        }
    );

    const element_click = tool(
        async (input) => {
            const startTime = Date.now();
            await removeHighlight(context);
            
            // Use frame context if set, otherwise use main page
            const targetContext = context.currentFrame || context.page;
            
            // Try regular selector first, fallback to shadow DOM search
            try {
                await targetContext.waitForSelector(input.selector, { visible: true, timeout: 2000 });
                await highlight(context, input.selector);
                await targetContext.click(input.selector);
            } catch {
                // Element might be in Shadow DOM
                const found = await findElementWithShadowDom(input.selector);
                if (!found) {
                    throw new Error(`Element not found: ${input.selector}`);
                }
                await highlight(context, input.selector);
                await clickElementWithShadowDom(input.selector);
            }
            
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] element_click | Duration: ${duration}ms | Selector: ${input.selector}`);
            return `Clicked element with selector ${input.selector}`;
        },
        {
            name: "element_click",
            description: "Click an element specified by a CSS selector. Input should be a JSON object with a 'selector' field. Supports elements inside Shadow DOM.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the element to click."),
            }),
        }
    );

    const wait_for_element = tool(
        async (input) => {
            const startTime = Date.now();
            
            // Use frame context if set, otherwise use main page
            const targetContext = context.currentFrame || context.page;
            
            await targetContext.waitForSelector(input.selector, { visible: true });
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] wait_for_element | Duration: ${duration}ms | Selector: ${input.selector}`);
            return `Element with selector ${input.selector} is now visible`;
        },
        {
            name: "wait_for_element",
            description: "Wait for an element specified by a CSS selector to become visible. Input should be a JSON object with a 'selector' field.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the element to wait for."),
            }),
        }
    );

    const element_select_option = tool(
        async (input) => {
            const startTime = Date.now();
            await removeHighlight(context);
            
            // Use frame context if set, otherwise use main page
            const targetContext = context.currentFrame || context.page;
            
            await targetContext.waitForSelector(input.selector, { visible: true });
            await highlight(context, input.selector);
            await targetContext.select(input.selector, ...input.values);
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] element_select_option | Duration: ${duration}ms | Selector: ${input.selector} | Values: ${input.values.join(', ')}`);
            return `Selected options [${input.values.join(', ')}] in element with selector ${input.selector}`;
        },
        {
            name: "element_select_option",
            description: "Select one or more options in a <select> element specified by a CSS selector. Input should be a JSON object with 'selector' and 'values' fields. Use when elements are dropdowns.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the <select> element."),
                values: z.array(z.string()).describe("The values of the options to select."),
            }),
        }
    );

    const wait_for_timeout = tool(
        async (input) => {
            const startTime = Date.now();
            await new Promise((resolve) => setTimeout(resolve, input.milliseconds));
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] wait_for_timeout | Duration: ${duration}ms | Waited: ${input.milliseconds}ms`);
            return `Waited for ${input.milliseconds} milliseconds`;
        },
        {
            name: "wait_for_timeout",
            description: "Wait for a specified amount of time in milliseconds. Input should be a JSON object with a 'milliseconds' field.",
            schema: z.object({
                milliseconds: z.number().describe("The number of milliseconds to wait."),
            }),
        }
    );

    const wait_for_page_load = tool(
        async (input) => {
            const startTime = Date.now();
            const timeout = input.timeout || 30000;
            const checkInterval = 500;
            let lastElementCount = 0;
            let stableCount = 0;
            const requiredStableChecks = 3; // Page is considered loaded after 3 stable checks (1.5s of no changes)

            logger.log(`[TOOL] wait_for_page_load | Starting... Timeout: ${timeout}ms`);

            while (Date.now() - startTime < timeout) {
                // Wait for network to be idle
                try {
                    await context.page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
                } catch {
                    // Network might not become completely idle, continue checking
                }

                // Count interactive elements including Shadow DOM
                const elementCount = await context.page.evaluate(() => {
                    function countElements(root: Document | ShadowRoot | Element): number {
                        const selector = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [onclick]';
                        let count = root.querySelectorAll(selector).length;
                        
                        const allElements = root.querySelectorAll('*');
                        allElements.forEach(el => {
                            if (el.shadowRoot) {
                                count += countElements(el.shadowRoot);
                            }
                        });
                        return count;
                    }
                    return countElements(document);
                });

                if (elementCount === lastElementCount && elementCount > 0) {
                    stableCount++;
                    if (stableCount >= requiredStableChecks) {
                        const duration = Date.now() - startTime;
                        logger.log(`[TOOL] wait_for_page_load | Duration: ${duration}ms | Elements stabilized at: ${elementCount}`);
                        return `Page loaded successfully. Found ${elementCount} interactive elements after ${duration}ms.`;
                    }
                } else {
                    stableCount = 0;
                    lastElementCount = elementCount;
                }

                await new Promise((resolve) => setTimeout(resolve, checkInterval));
            }

            const duration = Date.now() - startTime;
            logger.log(`[TOOL] wait_for_page_load | Duration: ${duration}ms | Timeout reached with ${lastElementCount} elements`);
            return `Page load timeout after ${timeout}ms. Current element count: ${lastElementCount}`;
        },
        {
            name: "wait_for_page_load",
            description: "Wait for the page to fully load by monitoring network activity and DOM stability. Use this after navigation or actions that trigger page loads (like login). More reliable than wait_for_timeout for dynamic pages.",
            schema: z.object({
                timeout: z.number().optional().describe("Maximum time to wait in milliseconds. Default is 30000 (30 seconds)."),
            }),
        }
    );

    const wait_for_text = tool(
        async (input) => {
            const startTime = Date.now();
            const timeout = input.timeout || 30000;
            const checkInterval = 500;

            logger.log(`[TOOL] wait_for_text | Waiting for text: "${input.text}"`);

            while (Date.now() - startTime < timeout) {
                const found = await context.page.evaluate((searchText) => {
                    function searchInNode(root: Document | ShadowRoot | Element): boolean {
                        // Check text content
                        if (root instanceof Element || root instanceof Document) {
                            const textContent = root instanceof Document ? document.body?.innerText : (root as HTMLElement).innerText;
                            if (textContent && textContent.toLowerCase().includes(searchText.toLowerCase())) {
                                return true;
                            }
                        }

                        // Search in shadow DOMs
                        const allElements = root.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.shadowRoot) {
                                if (searchInNode(el.shadowRoot)) return true;
                            }
                        }
                        return false;
                    }
                    return searchInNode(document);
                }, input.text);

                if (found) {
                    const duration = Date.now() - startTime;
                    logger.log(`[TOOL] wait_for_text | Duration: ${duration}ms | Found: "${input.text}"`);
                    return `Text "${input.text}" found on page after ${duration}ms.`;
                }

                await new Promise((resolve) => setTimeout(resolve, checkInterval));
            }

            const duration = Date.now() - startTime;
            logger.log(`[TOOL] wait_for_text | Duration: ${duration}ms | Timeout - text not found: "${input.text}"`);
            return `Timeout after ${timeout}ms. Text "${input.text}" was not found on the page.`;
        },
        {
            name: "wait_for_text",
            description: "Wait for specific text to appear on the page (including Shadow DOM). Use this to wait for elements that contain specific text like 'Pesquisa de Cliente' to appear.",
            schema: z.object({
                text: z.string().describe("The text to wait for on the page."),
                timeout: z.number().optional().describe("Maximum time to wait in milliseconds. Default is 30000 (30 seconds)."),
            }),
        }
    );

    const press_keyboard_key = tool(
        async (input) => {
            const startTime = Date.now();
            await context.page.keyboard.press(input.key as KeyInput);
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] press_keyboard_key | Duration: ${duration}ms | Key: ${input.key}`);
            return `Pressed keyboard key: ${input.key}`;
        },
        {
            name: "press_keyboard_key",
            description: "Press a keyboard key. Input should be a JSON object with a 'key' field.",
            schema: z.object({
                key: z.string().describe("The keyboard key to press (e.g., 'Enter', 'Tab'). Puppeteer KeyInput values are supported."),
            }),
        }
    );

    const get_page_content = tool(
        async () => {
            const startTime = Date.now();
            
            // Use frame context if set, otherwise use main page
            const targetContext = context.currentFrame || context.page;
            const frameInfo = context.currentFrame 
                ? `frame: "${context.currentFrame.name() || context.currentFrame.url()}"` 
                : 'main page';
            
            const elements = await targetContext.evaluate(() => {
                const interactiveSelectors = [
                    'a',
                    'span',
                    'p',
                    'button',
                    'input',
                    'select',
                    'textarea',
                    'label',
                    'img',
                    'iframe',
                    'frame',
                    'frameset',
                    '[role="button"]',
                    '[role="link"]',
                    '[role="menuitem"]',
                    '[role="tab"]',
                    '[role="option"]',
                    '[role="listbox"]',
                    '[onclick]',
                    '[tabindex]',
                ];

                const results: Array<{
                    tag: string;
                    type?: string;
                    text: string;
                    href?: string;
                    name?: string;
                    id?: string;
                    ariaLabel?: string;
                    ariaExpanded?: string;
                    alt?: string;
                    placeholder?: string;
                    value?: string;
                    src?: string;
                    selector: string;
                    parentId?: number;
                    inShadowDom?: boolean;
                    formContext?: string;
                    options?: Array<{ value: string; text: string; selected: boolean }>;
                }> = [];

                // Helper function to check if element is visible
                function isElementVisible(el: Element): boolean {
                    const htmlEl = el as HTMLElement;
                    const rect = htmlEl.getBoundingClientRect();
                    const style = window.getComputedStyle(htmlEl);

                    // Check basic visibility
                    const isHidden = 
                        style.visibility === 'hidden' ||
                        style.display === 'none' ||
                        style.opacity === '0';

                    if (isHidden) return false;

                    // For text elements (SPAN, P), allow even if dimensions are small
                    // as long as they have text content
                    const isTextElement = ['SPAN', 'P'].includes(htmlEl.tagName);
                    if (isTextElement) {
                        const hasText = (htmlEl.innerText?.trim().length || 0) > 0;
                        return hasText;
                    }

                    // For other elements, require dimensions
                    return rect.width > 0 && rect.height > 0;
                }

                // Helper function to check if element is inside a button
                function isInsideButton(el: Element): boolean {
                    let current: Element | null = el.parentElement;
                    let depth = 0;
                    const maxDepth = 5; // Check 5 levels up
                    
                    while (current && depth < maxDepth) {
                        const htmlCurrent = current as HTMLElement;
                        
                        if (htmlCurrent.tagName === 'BUTTON') {
                            return true;
                        }
                        
                        // Stop at shadow root boundary
                        if (current.parentNode instanceof ShadowRoot) break;
                        
                        current = current.parentElement;
                        depth++;
                    }
                    return false;
                }

                // Helper function to check if element is interactive
                function isElementInteractive(el: Element): boolean {
                    const htmlEl = el as HTMLElement;
                    const style = window.getComputedStyle(htmlEl);
                    
                    // Frames are always interactive
                    if (['IFRAME', 'FRAME', 'FRAMESET'].includes(htmlEl.tagName)) return true;
                    
                    // Images are always included for accessibility inspection
                    if (htmlEl.tagName === 'IMG') return true;
                    
                    // Interactive by cursor
                    if (style.cursor === 'pointer') return true;
                    
                    // Interactive by tag
                    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
                    if (interactiveTags.includes(htmlEl.tagName)) return true;
                    
                    // SPAN and P filtering strategy:
                    // Include only if they meet specific criteria to reduce noise
                    const textTags = ['SPAN', 'P'];
                    if (textTags.includes(htmlEl.tagName)) {
                        const hasText = (htmlEl.innerText?.trim().length || 0) > 0;
                        if (!hasText) return false;
                        
                        // Exclude if text is too short (likely decorative)
                        const text = htmlEl.innerText?.trim();
                        if (text.length < 2) return false;
                        
                        // CRITICAL: Check if span is inside a button element
                        // Exclude unless it has cursor:pointer
                        if (isInsideButton(el)) {
                            // Only include if it has cursor:pointer style
                            return style.cursor === 'pointer';
                        }
                        
                        // Include if it has onclick or other interactive attributes
                        if (htmlEl.hasAttribute('onclick') || htmlEl.hasAttribute('tabindex')) return true;
                        
                        // Include if it has a role attribute
                        if (htmlEl.getAttribute('role')) return true;
                        
                        // For Shadow DOM elements, be more permissive as they might be button labels
                        // that need to be visible for the agent to understand what to click
                        const inShadowDom = (el.getRootNode() !== document);
                        if (inShadowDom) {
                            // In shadow DOM, include if it's a standalone text element
                            // that might be a label or important UI element
                            return text.length >= 3;
                        }
                        
                        // For regular DOM, exclude most spans/p to reduce noise
                        // Only include if they seem like standalone interactive labels
                        return false;
                    }
                    
                    // Has role
                    if (htmlEl.getAttribute('role')) return true;
                    
                    // Has onclick or tabindex
                    if (htmlEl.hasAttribute('onclick') || htmlEl.hasAttribute('tabindex')) return true;
                    
                    return false;
                }

                // Helper function to find the form/container context of an element
                function getFormContext(el: Element): string | undefined {
                    const containerTags = ['ARTICLE', 'FORM', 'SECTION', 'DIALOG', 'DIV'];
                    let current: Element | null = el.parentElement;
                    
                    while (current) {
                        // Check if it's a container element
                        if (containerTags.includes(current.tagName)) {
                            const htmlCurrent = current as HTMLElement;
                            // Look for a title/header text in the container
                            const headerSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[class*="title"]', '[class*="header"]', 'legend', '.slds-text-heading'];
                            for (const sel of headerSelectors) {
                                const header = current.querySelector(sel);
                                if (header) {
                                    const headerText = (header as HTMLElement).innerText?.trim();
                                    if (headerText && headerText.length > 2 && headerText.length < 100) {
                                        return headerText.substring(0, 50);
                                    }
                                }
                            }
                            
                            // Try aria-label or title attribute
                            const ariaLabel = htmlCurrent.getAttribute('aria-label') || htmlCurrent.getAttribute('title');
                            if (ariaLabel && ariaLabel.length > 2 && ariaLabel.length < 100) {
                                return ariaLabel.substring(0, 50);
                            }
                            
                            // Try to get the first significant text
                            const firstText = htmlCurrent.innerText?.trim().split('\n')[0];
                            if (firstText && firstText.length > 2 && firstText.length < 50) {
                                return firstText;
                            }
                        }
                        
                        // Check if parent is in shadow DOM
                        if (current.parentNode instanceof ShadowRoot) {
                            // Look for context in the shadow host
                            const shadowHost = current.parentNode.host;
                            if (shadowHost) {
                                const hostText = (shadowHost as HTMLElement).innerText?.trim().split('\n')[0];
                                if (hostText && hostText.length > 2 && hostText.length < 50) {
                                    return hostText;
                                }
                            }
                            break;
                        }
                        
                        current = current.parentElement;
                    }
                    
                    return undefined;
                }

                // Function to recursively collect VISIBLE and INTERACTIVE elements from shadow DOMs
                function collectElements(root: Document | ShadowRoot | Element, shadowPath: string[] = [], shadowContext?: string): Element[] {
                    const elements: Element[] = [];
                    const selector = interactiveSelectors.join(', ');
                    
                    // Get elements from current root - only add if visible and interactive
                    const found = root.querySelectorAll(selector);
                    found.forEach(el => {
                        if (isElementVisible(el) && isElementInteractive(el)) {
                            (el as any).__shadowPath = shadowPath;
                            (el as any).__shadowContext = shadowContext;
                            elements.push(el);
                        }
                    });
                    
                    // Find all elements with shadow roots and recurse
                    const allElements = root.querySelectorAll('*');
                    allElements.forEach((el, index) => {
                        if (el.shadowRoot) {
                            const newPath = [...shadowPath, `[${index}]`];
                            // Try to get context from the shadow host element
                            const hostText = (el as HTMLElement).innerText?.trim().split('\n')[0];
                            const newContext = (hostText && hostText.length > 2 && hostText.length < 100) 
                                ? hostText.substring(0, 50) 
                                : shadowContext;
                            elements.push(...collectElements(el.shadowRoot, newPath, newContext));
                        }
                    });
                    
                    return elements;
                }

                const allElements = collectElements(document);
                const elementsList = Array.from(allElements);
                const elementIndexMap = new Map<Element, number>();

                elementsList.forEach((el) => {
                    const htmlEl = el as HTMLElement;
                    const shadowPath = (el as any).__shadowPath || [];
                    const shadowContext = (el as any).__shadowContext;
                    const inShadowDom = shadowPath.length > 0;

                    const getUniqueSelector = (element: HTMLElement, inShadow: boolean): string => {
                        // For shadow DOM elements, try to build a path that can be used with pierce selectors
                        if (element.id) {
                            const idSelector = `#${CSS.escape(element.id)}`;
                            // In shadow DOM, we can't check document-wide uniqueness
                            if (!inShadow) {
                                try {
                                    if (document.querySelectorAll(idSelector).length === 1) {
                                        return idSelector;
                                    }
                                } catch (e) {
                                    // Ignore errors from invalid selectors
                                }
                            } else {
                                return idSelector;
                            }
                        }

                        const path: string[] = [];
                        let current: HTMLElement | null = element;

                        while (current && current !== document.body && !(current.parentNode instanceof ShadowRoot)) {
                            let selector = current.tagName.toLowerCase();

                            if (current.id) {
                                selector = `#${CSS.escape(current.id)}`;
                                path.unshift(selector);
                                break;
                            }

                            const parent = current.parentElement;
                            if (parent) {
                                const siblings = Array.from(parent.children).filter(
                                    (child: Element) => child.tagName === current!.tagName
                                );
                                if (siblings.length > 1) {
                                    const index = siblings.indexOf(current) + 1;
                                    selector += `:nth-of-type(${index})`;
                                }
                            }

                            path.unshift(selector);
                            current = parent;
                        }

                        return path.join(' > ');
                    };

                    const selector = getUniqueSelector(htmlEl, inShadowDom);

                    // Get text from element itself or from nearby elements for inputs/labels without text
                    let text = htmlEl.innerText?.trim().substring(0, 100) || 
                               htmlEl.getAttribute('aria-label') || 
                               htmlEl.getAttribute('alt') || 
                               htmlEl.getAttribute('title') || 
                               htmlEl.getAttribute('data-label') ||
                               '';
                    
                    // For inputs, selects, and labels without text, try to find associated text from nearby elements
                    if (!text && ['INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(htmlEl.tagName)) {
                        // Strategy 1: Look for associated label by 'for' attribute or wrapping label
                        if (htmlEl.tagName === 'INPUT' || htmlEl.tagName === 'SELECT' || htmlEl.tagName === 'TEXTAREA') {
                            if (htmlEl.id) {
                                const associatedLabel = (htmlEl.getRootNode() as Document | ShadowRoot).querySelector(`label[for="${htmlEl.id}"]`);
                                if (associatedLabel) {
                                    text = (associatedLabel as HTMLElement).innerText?.trim().substring(0, 100) || '';
                                }
                            }
                            
                            // Check if input is wrapped in a label
                            if (!text) {
                                let current: Element | null = htmlEl.parentElement;
                                while (current && !text) {
                                    if (current.tagName === 'LABEL') {
                                        text = (current as HTMLElement).innerText?.trim().substring(0, 100) || '';
                                        break;
                                    }
                                    // Don't go too far up
                                    if (current.parentNode instanceof ShadowRoot) break;
                                    current = current.parentElement;
                                }
                            }
                        }
                        
                        // Strategy 2: Look for preceding sibling spans/paragraphs with text (common in Lightning components)
                        if (!text) {
                            const siblings = htmlEl.parentElement?.children;
                            if (siblings) {
                                for (let i = 0; i < siblings.length; i++) {
                                    const sibling = siblings[i];
                                    // Find the current element's position
                                    if (sibling === htmlEl && i > 0) {
                                        // Check previous siblings
                                        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                                            const prevSibling = siblings[j] as HTMLElement;
                                            if (['SPAN', 'P', 'DIV', 'LABEL'].includes(prevSibling.tagName)) {
                                                const siblingText = prevSibling.innerText?.trim();
                                                if (siblingText && siblingText.length > 0 && siblingText.length < 100) {
                                                    text = siblingText.substring(0, 100);
                                                    break;
                                                }
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // Strategy 3: Look at parent's previous sibling (for nested label structures)
                        if (!text && htmlEl.parentElement) {
                            const parentSiblings = htmlEl.parentElement.parentElement?.children;
                            if (parentSiblings) {
                                const parentIndex = Array.from(parentSiblings).indexOf(htmlEl.parentElement);
                                if (parentIndex > 0) {
                                    const prevParentSibling = parentSiblings[parentIndex - 1] as HTMLElement;
                                    const prevText = prevParentSibling.innerText?.trim();
                                    if (prevText && prevText.length > 0 && prevText.length < 100) {
                                        text = prevText.substring(0, 100);
                                    }
                                }
                            }
                        }
                    }

                    let parentId: number | undefined;
                    let parent = htmlEl.parentElement;
                    while (parent) {
                        if (elementIndexMap.has(parent)) {
                            parentId = elementIndexMap.get(parent);
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    // Get form context - use shadow context if available, otherwise compute it
                    const formContext = shadowContext || getFormContext(el);

                    // Get options for select elements
                    let options: Array<{ value: string; text: string; selected: boolean }> | undefined;
                    if (htmlEl.tagName === 'SELECT') {
                        const selectEl = htmlEl as HTMLSelectElement;
                        options = Array.from(selectEl.options).map(opt => ({
                            value: opt.value,
                            text: opt.text.trim(),
                            selected: opt.selected,
                        }));
                    }

                    const currentIndex = results.length;
                    elementIndexMap.set(el, currentIndex);

                    results.push({
                        tag: htmlEl.tagName.toLowerCase(),
                        type: htmlEl.getAttribute('type') || undefined,
                        text: text,
                        href: htmlEl.getAttribute('href') || undefined,
                        name: htmlEl.getAttribute('name') || undefined,
                        id: htmlEl.id || undefined,
                        ariaLabel: htmlEl.getAttribute('aria-label') || undefined,
                        ariaExpanded: htmlEl.getAttribute('aria-expanded') || undefined,
                        alt: htmlEl.getAttribute('alt') || undefined,
                        placeholder: htmlEl.getAttribute('placeholder') || undefined,
                        value: (htmlEl as HTMLInputElement).value || undefined,
                        src: htmlEl.getAttribute('src') || undefined,
                        selector: selector,
                        parentId: parentId,
                        inShadowDom: inShadowDom || undefined,
                        formContext: formContext,
                        options: options,
                    });
                });

                return results;
            });

            const formatted = elements.map((el, i) => {
                let desc = `[${i}] <${el.tag}`;
                if (el.type) desc += ` type="${el.type}"`;
                if (el.id) desc += ` id="${el.id}"`;
                if (el.name) desc += ` name="${el.name}"`;
                if (el.ariaLabel) desc += ` aria-label="${el.ariaLabel.substring(0, 50)}"`;
                if (el.ariaExpanded) desc += ` aria-expanded="${el.ariaExpanded}"`;
                if (el.alt) desc += ` alt="${el.alt.substring(0, 50)}"`;
                if (el.src) desc += ` src="${el.src.substring(0, 50)}"`;
                if (el.href) desc += ` href="${el.href.substring(0, 50)}"`;
                if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
                desc += `>`;
                if (el.text) desc += ` "${el.text.substring(0, 50)}"`;
                desc += ` [selector: ${el.selector}]`;
                if (el.options && el.options.length > 0) {
                    const optionsStr = el.options.map(o => {
                        const selectedMark = o.selected ? '*' : '';
                        return `${selectedMark}"${o.text}"(${o.value})`;
                    }).join(', ');
                    desc += ` [options: ${optionsStr}]`;
                }
                if (el.inShadowDom) desc += ` [shadow-dom]`;
                if (el.formContext) desc += ` [form: ${el.formContext}]`;
                if (el.parentId !== undefined) desc += ` [parent: ${el.parentId}]`;
                return desc;
            }).join('\n');

            const shadowCount = elements.filter(e => e.inShadowDom).length;
            const frameCount = elements.filter(e => ['iframe', 'frame', 'frameset'].includes(e.tag)).length;
            
            let result = `Context: ${frameInfo}\n`;
            result += `Found ${elements.length} interactive elements (${shadowCount} in Shadow DOM, ${frameCount} frames):\n${formatted}`;
            
            const duration = Date.now() - startTime;
            
            logger.log(`[TOOL] get_page_content | Duration: ${duration}ms | Context: ${frameInfo} | Elements: ${elements.length} | Shadow DOM: ${shadowCount} | Frames: ${frameCount}`);
            
            return result;
        },
        {
            name: "get_page_content",
            description: "Retrieve visible interactive elements from the current page (links, buttons, inputs, selects, labels). Each element includes a [form: ...] tag showing which form/container it belongs to, helping identify the correct element when there are multiple similar ones.",
            schema: z.object({}),
        }
    );


    async function highlight(context: BrowserContext, selector: string) {
        await context.page.evaluate((sel) => {
            const existingOverlay = document.getElementById('__conductor_highlight_overlay__');
            if (existingOverlay) {
                existingOverlay.remove();
            }

            if ((window as any).__conductor_highlight_timeout__) {
                clearTimeout((window as any).__conductor_highlight_timeout__);
                (window as any).__conductor_highlight_timeout__ = null;
            }

            let el: Element | null = null;
            
            // Strategy 1: Direct querySelector
            el = document.querySelector(sel);
            
            // Strategy 2: If selector contains :nth-child or complex pseudo-selectors, try alternatives
            if (!el && sel.includes(':nth-child')) {
                const simplifiedSelector = sel.replace(/:nth-child\(\d+\)/g, '');
                el = document.querySelector(simplifiedSelector);
            }
            
            // Strategy 3: Try finding by partial attribute match
            if (!el && sel.includes('[')) {
                const attrMatch = sel.match(/\[([^\]]+)\]/);
                if (attrMatch) {
                    const elements = document.querySelectorAll(`[${attrMatch[1]}]`);
                    if (elements.length === 1) {
                        el = elements[0];
                    }
                }
            }

            if (!el) return;

            const rect = el.getBoundingClientRect();
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            const overlay = document.createElement('div');
            overlay.id = '__conductor_highlight_overlay__';
            
            Object.assign(overlay.style, {
                position: 'absolute',
                top: `${rect.top + scrollY - 4}px`,
                left: `${rect.left + scrollX - 4}px`,
                width: `${rect.width + 8}px`,
                height: `${rect.height + 8}px`,
                border: '2px solid #6366f1',
                borderRadius: '6px',
                boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(99, 102, 241, 0.25)',
                pointerEvents: 'none',
                zIndex: '2147483647',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                animation: '__conductor_pulse__ 1.5s ease-in-out infinite',
                boxSizing: 'border-box',
            });

            if (!document.getElementById('__conductor_highlight_styles__')) {
                const styleSheet = document.createElement('style');
                styleSheet.id = '__conductor_highlight_styles__';
                styleSheet.textContent = `
                    @keyframes __conductor_pulse__ {
                        0%, 100% {
                            box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(99, 102, 241, 0.25);
                        }
                        50% {
                            box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.1), 0 4px 20px rgba(99, 102, 241, 0.35);
                        }
                    }
                `;
                document.head.appendChild(styleSheet);
            }

            document.body.appendChild(overlay);
            
            (window as any).__conductor_highlight_timeout__ = setTimeout(() => {
                const currentOverlay = document.getElementById('__conductor_highlight_overlay__');
                if (currentOverlay) {
                    currentOverlay.style.transition = 'opacity 0.3s ease-out';
                    currentOverlay.style.opacity = '0';
                    setTimeout(() => currentOverlay.remove(), 300);
                }
                (window as any).__conductor_highlight_timeout__ = null;
            }, 3000);
        }, selector);
    }

    async function removeHighlight(context: BrowserContext) {
        await context.page.evaluate(() => {
            const overlay = document.getElementById('__conductor_highlight_overlay__');
            if (overlay) {
                overlay.style.transition = 'opacity 0.15s ease-out';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 150);
            }
        });
    }

    const switch_to_frame = tool(
        async (input) => {
            const startTime = Date.now();
            
            if (input.selector === "main" || input.selector === "default") {
                context.currentFrame = undefined;
                const duration = Date.now() - startTime;
                logger.log(`[TOOL] switch_to_frame | Duration: ${duration}ms | Switched to main context`);
                return `Switched to main page context (exited all frames)`;
            }
            
            const frames = context.page.frames();
            let targetFrame: Frame | undefined;
            
            targetFrame = frames.find(f => f.name() === input.selector);
            
            if (!targetFrame) {
                targetFrame = frames.find(f => f.url().includes(input.selector));
            }
            
            if (!targetFrame && /^\d+$/.test(input.selector)) {
                const index = parseInt(input.selector, 10);
                if (index >= 0 && index < frames.length) {
                    targetFrame = frames[index];
                }
            }
            
            if (!targetFrame) {
                try {
                    const frameElement = await context.page.$(input.selector);
                    if (frameElement) {
                        const frameName = await frameElement.evaluate((el: HTMLIFrameElement) => el.name || el.id);
                        if (frameName) {
                            targetFrame = frames.find(f => f.name() === frameName);
                        }
                    }
                } catch (error) {
                    logger.warn(`Error while trying to find frame by selector ${input.selector}: ${error}`);
                }
            }
            
            if (!targetFrame) {
                const duration = Date.now() - startTime;
                logger.log(`[TOOL] switch_to_frame | Duration: ${duration}ms | Frame not found: ${input.selector}`);
                const availableFrames = frames.map((f, i) => `[${i}] name="${f.name()}" url="${f.url()}"`).join(', ');
                return `Frame not found with selector: ${input.selector}. Available frames: ${availableFrames}`;
            }
            
            context.currentFrame = targetFrame;
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] switch_to_frame | Duration: ${duration}ms | Switched to frame: ${targetFrame.name() || targetFrame.url()}`);
            
            return `Switched to frame: name="${targetFrame.name()}" url="${targetFrame.url().substring(0, 100)}"`;
        },
        {
            name: "switch_to_frame",
            description: "Switch context to an iframe or frame to interact with elements inside it. You can switch by frame selector, name, index, or use 'main' to return to the main page context. After switching, all subsequent actions (click, type, get_page_content) will target the selected frame.",
            schema: z.object({
                selector: z.string().describe("Frame selector (CSS selector, frame name, frame index as string, or 'main' to return to main context). Examples: 'iframe[name=\"myframe\"]', 'myframe', '0', 'main'"),
            }),
        }
    );

    const upload_file = tool(
        async (input) => {
            const startTime = Date.now();
            
            const targetContext = context.currentFrame || context.page;
            
            const fileExists = await targetContext.evaluate((sel) => {
                function findElement(root: Document | ShadowRoot | Element): Element | null {
                    const found = root.querySelector(sel);
                    if (found) return found;

                    const allElements = root.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            const shadowResult = findElement(el.shadowRoot);
                            if (shadowResult) return shadowResult;
                        }
                    }
                    return null;
                }
                
                const element = findElement(document);
                return element !== null && element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'file';
            }, input.selector);
            
            if (!fileExists) {
                const duration = Date.now() - startTime;
                logger.error(`[TOOL] upload_file | Duration: ${duration}ms | File input not found: ${input.selector}`);
                return `Error: File input not found with selector: ${input.selector}`;
            }

            try {
                const fileInput = await targetContext.$(input.selector);
                if (fileInput) {
                    const tagName = await fileInput.evaluate((el: Element) => el.tagName);
                    if (tagName === 'INPUT') {
                        await (fileInput as any).uploadFile(input.filePath);
                        await fileInput.evaluate((el: Element) => {
                            const event = new Event('change', { bubbles: true });
                            el.dispatchEvent(event);
                        });
                    }
                } else {
                    await targetContext.evaluate((sel, path) => {
                        function findElement(root: Document | ShadowRoot | Element): HTMLInputElement | null {
                            const found = root.querySelector(sel) as HTMLInputElement;
                            if (found && found.tagName === 'INPUT' && found.type === 'file') return found;

                            const allElements = root.querySelectorAll('*');
                            for (const el of allElements) {
                                if (el.shadowRoot) {
                                    const shadowResult = findElement(el.shadowRoot);
                                    if (shadowResult) return shadowResult;
                                }
                            }
                            return null;
                        }
                        
                        const element = findElement(document);
                        if (!element) {
                            throw new Error(`File input not found: ${sel}`);
                        }
                        
                        const event = new Event('input', { bubbles: true });
                        element.dispatchEvent(event);
                        const changeEvent = new Event('change', { bubbles: true });
                        element.dispatchEvent(changeEvent);
                    }, input.selector, input.filePath);
                }
            } catch (error) {
                const duration = Date.now() - startTime;
                logger.error(`[TOOL] upload_file | Duration: ${duration}ms | Failed to upload file: ${error}`);
                return `Error: Failed to upload file - ${error}`;
            }
            
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] upload_file | Duration: ${duration}ms | Selector: ${input.selector} | File: ${input.filePath}`);
            return `Uploaded file ${input.filePath} to element ${input.selector}`;
        },
        {
            name: "upload_file",
            description: "Upload a file to a file input element. Supports elements inside Shadow DOM. Use this after generating a PDF or when you need to attach files.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the file input element (input[type='file'])."),
                filePath: z.string().describe("The absolute path to the file to upload."),
            }),
        }
    );

    const generate_dummy_pdf = tool(
        async (input) => {
            const startTime = Date.now();
            
            try {
                const tempDir = input.outputDir || undefined;
                if (tempDir) {
                    cleanupOldFiles(tempDir, 24);
                }
                
                const filePath = await generatePdf({
                    fileName: input.fileName,
                    content: input.content,
                    outputDir: tempDir,
                });
                
                const duration = Date.now() - startTime;
                logger.log(`[TOOL] generate_dummy_pdf | Duration: ${duration}ms | File: ${filePath}`);
                return `Generated PDF at: ${filePath}`;
            } catch (error) {
                const duration = Date.now() - startTime;
                logger.error(`[TOOL] generate_dummy_pdf | Duration: ${duration}ms | Failed to generate PDF: ${error}`);
                return `Error: Failed to generate PDF - ${error}`;
            }
        },
        {
            name: "generate_dummy_pdf",
            description: "Generate a dummy PDF file for testing purposes. Use this before uploading files when you need to attach a PDF document.",
            schema: z.object({
                fileName: z.string().optional().describe("The name of the PDF file. If not provided, a timestamp-based name will be used."),
                content: z.string().optional().describe("The text content to include in the PDF. If not provided, default test content will be used."),
                outputDir: z.string().optional().describe("The directory where the PDF will be saved. If not provided, defaults to 'temp/uploads' in the project directory."),
            }),
        }
    );

    const inspect_accessibility = tool(
        async (input) => {
            const startTime = Date.now();
            
            const targetContext = context.currentFrame || context.page;
            const frameInfo = context.currentFrame 
                ? `frame: "${context.currentFrame.name() || context.currentFrame.url()}"` 
                : 'main page';
            
            const accessibilityReport = await targetContext.evaluate((elementType) => {
                const results: Array<{
                    tag: string;
                    selector: string;
                    alt?: string;
                    ariaLabel?: string;
                    role?: string;
                    title?: string;
                    src?: string;
                    tabindex?: string;
                    hasAltIssue?: boolean;
                    issue?: string;
                    inShadowDom?: boolean;
                }> = [];

                function collectAccessibilityElements(root: Document | ShadowRoot | Element, shadowPath: string[] = []): void {
                    const inShadowDom = shadowPath.length > 0;
                    let selector = '';
                    
                    if (elementType === 'images' || elementType === 'all') {
                        const images = root.querySelectorAll('img');
                        images.forEach((img, index) => {
                            const htmlImg = img as HTMLImageElement;
                            const alt = htmlImg.getAttribute('alt');
                            const role = htmlImg.getAttribute('role');
                            const ariaLabel = htmlImg.getAttribute('aria-label');
                            
                            if (htmlImg.id) {
                                selector = `#${CSS.escape(htmlImg.id)}`;
                            } else if (htmlImg.src) {
                                selector = `img[src="${htmlImg.src.substring(0, 50)}"]`;
                            } else {
                                selector = `img:nth-of-type(${index + 1})`;
                            }
                            
                            let hasAltIssue = false;
                            let issue = '';
                            
                            const isDecorative = role === 'presentation' || role === 'none' || alt === '';
                            
                            if (alt === null) {
                                hasAltIssue = true;
                                issue = 'Missing alt attribute';
                            } else if (!isDecorative && alt.trim().length === 0) {
                                hasAltIssue = true;
                                issue = 'Empty alt on informative image';
                            } else if (alt && alt.length > 150) {
                                hasAltIssue = true;
                                issue = 'Alt text too long (>150 chars)';
                            }
                            
                            results.push({
                                tag: 'img',
                                selector: selector,
                                alt: alt || undefined,
                                ariaLabel: ariaLabel || undefined,
                                role: role || undefined,
                                title: htmlImg.getAttribute('title') || undefined,
                                src: htmlImg.src?.substring(0, 100) || undefined,
                                hasAltIssue: hasAltIssue,
                                issue: issue || undefined,
                                inShadowDom: inShadowDom || undefined,
                            });
                        });
                    }
                    
                    if (elementType === 'buttons' || elementType === 'all') {
                        const buttons = root.querySelectorAll('button, [role="button"]');
                        buttons.forEach((btn, index) => {
                            const htmlBtn = btn as HTMLElement;
                            const ariaLabel = htmlBtn.getAttribute('aria-label');
                            const innerText = htmlBtn.innerText?.trim();
                            const role = htmlBtn.getAttribute('role');
                            
                            if (htmlBtn.id) {
                                selector = `#${CSS.escape(htmlBtn.id)}`;
                            } else {
                                selector = `button:nth-of-type(${index + 1})`;
                            }
                            
                            let hasAltIssue = false;
                            let issue = '';
                            
                            if (!ariaLabel && !innerText) {
                                hasAltIssue = true;
                                issue = 'Button has no accessible name (no aria-label or text content)';
                            }
                            
                            results.push({
                                tag: htmlBtn.tagName.toLowerCase(),
                                selector: selector,
                                ariaLabel: ariaLabel || undefined,
                                role: role || undefined,
                                hasAltIssue: hasAltIssue,
                                issue: issue || undefined,
                                inShadowDom: inShadowDom || undefined,
                            });
                        });
                    }
                    
                    if (elementType === 'links' || elementType === 'all') {
                        const links = root.querySelectorAll('a');
                        links.forEach((link, index) => {
                            const htmlLink = link as HTMLAnchorElement;
                            const ariaLabel = htmlLink.getAttribute('aria-label');
                            const innerText = htmlLink.innerText?.trim();
                            const title = htmlLink.getAttribute('title');
                            
                            if (htmlLink.id) {
                                selector = `#${CSS.escape(htmlLink.id)}`;
                            } else {
                                selector = `a:nth-of-type(${index + 1})`;
                            }
                            
                            let hasAltIssue = false;
                            let issue = '';
                            
                            if (!ariaLabel && !innerText && !title) {
                                hasAltIssue = true;
                                issue = 'Link has no accessible name';
                            }
                            
                            results.push({
                                tag: 'a',
                                selector: selector,
                                ariaLabel: ariaLabel || undefined,
                                title: title || undefined,
                                hasAltIssue: hasAltIssue,
                                issue: issue || undefined,
                                inShadowDom: inShadowDom || undefined,
                            });
                        });
                    }
                    
                    if (elementType === 'inputs' || elementType === 'all') {
                        const inputs = root.querySelectorAll('input:not([type="hidden"]), select, textarea');
                        inputs.forEach((input, index) => {
                            const htmlInput = input as HTMLInputElement;
                            const ariaLabel = htmlInput.getAttribute('aria-label');
                            const placeholder = htmlInput.getAttribute('placeholder');
                            const id = htmlInput.id;
                            let hasAssociatedLabel = false;
                            
                            if (id) {
                                const label = (root as Document).querySelector(`label[for="${id}"]`);
                                hasAssociatedLabel = label !== null;
                            }
                            
                            if (htmlInput.id) {
                                selector = `#${CSS.escape(htmlInput.id)}`;
                            } else {
                                selector = `${htmlInput.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
                            }
                            
                            let hasAltIssue = false;
                            let issue = '';
                            
                            if (!ariaLabel && !hasAssociatedLabel && !placeholder) {
                                hasAltIssue = true;
                                issue = 'Input has no accessible label';
                            }
                            
                            results.push({
                                tag: htmlInput.tagName.toLowerCase(),
                                selector: selector,
                                ariaLabel: ariaLabel || undefined,
                                tabindex: htmlInput.getAttribute('tabindex') || undefined,
                                hasAltIssue: hasAltIssue,
                                issue: issue || undefined,
                                inShadowDom: inShadowDom || undefined,
                            });
                        });
                    }
                    
                    const allElements = root.querySelectorAll('*');
                    allElements.forEach((el, index) => {
                        if (el.shadowRoot) {
                            collectAccessibilityElements(el.shadowRoot, [...shadowPath, `[${index}]`]);
                        }
                    });
                }
                
                collectAccessibilityElements(document);
                return results;
            }, input.elementType || 'all');
            
            const duration = Date.now() - startTime;
            
            const totalElements = accessibilityReport.length;
            const elementsWithIssues = accessibilityReport.filter(e => e.hasAltIssue).length;
            const shadowDomElements = accessibilityReport.filter(e => e.inShadowDom).length;
            
            let report = `Accessibility Inspection Report (Context: ${frameInfo})\n`;
            report += `Total elements: ${totalElements} | Issues found: ${elementsWithIssues} | Shadow DOM: ${shadowDomElements}\n\n`;
            
            if (elementsWithIssues > 0) {
                report += `ELEMENTS WITH ISSUES:\n`;
                accessibilityReport.filter(e => e.hasAltIssue).forEach((el, i) => {
                    report += `[${i}] <${el.tag}`;
                    if (el.ariaLabel) report += ` aria-label="${el.ariaLabel.substring(0, 50)}"`;
                    if (el.alt !== undefined) report += ` alt="${el.alt || '(empty)'}"`; 
                    if (el.role) report += ` role="${el.role}"`;
                    if (el.src) report += ` src="${el.src.substring(0, 50)}"`;
                    report += `> [selector: ${el.selector}]`;
                    if (el.inShadowDom) report += ` [shadow-dom]`;
                    report += `\n   ⚠️ ISSUE: ${el.issue}\n`;
                });
                report += `\n`;
            }
            
            report += `ALL ELEMENTS:\n`;
            accessibilityReport.forEach((el, i) => {
                const status = el.hasAltIssue ? '🔴' : '✅';
                report += `${status} [${i}] <${el.tag}`;
                if (el.ariaLabel) report += ` aria-label="${el.ariaLabel.substring(0, 50)}"`;
                if (el.alt !== undefined) report += ` alt="${el.alt || '(empty)'}"`;
                if (el.role) report += ` role="${el.role}"`;
                if (el.src) report += ` src="${el.src.substring(0, 50)}"`;
                if (el.title) report += ` title="${el.title.substring(0, 50)}"`;
                report += `> [selector: ${el.selector}]`;
                if (el.inShadowDom) report += ` [shadow-dom]`;
                report += `\n`;
            });
            
            logger.log(`[TOOL] inspect_accessibility | Duration: ${duration}ms | Elements: ${totalElements} | Issues: ${elementsWithIssues}`);
            
            return report;
        },
        {
            name: "inspect_accessibility",
            description: "Inspect page elements for accessibility issues. Checks images for alt attributes, buttons for accessible names, links for text, and inputs for labels. Use this to audit accessibility compliance or find elements with missing alt text.",
            schema: z.object({
                elementType: z.enum(['images', 'buttons', 'links', 'inputs', 'all']).optional().describe("Type of elements to inspect. Default is 'all'. Use 'images' to check only images for alt attributes."),
            }),
        }
    );

    const wait_for_accordion_expand = tool(
        async (input) => {
            const startTime = Date.now();
            const timeout = input.timeout || 10000;
            const checkInterval = 200;

            logger.log(`[TOOL] wait_for_accordion_expand | Waiting for accordion to expand: ${input.selector}`);

            const targetContext = context.currentFrame || context.page;

            while (Date.now() - startTime < timeout) {
                const isExpanded = await targetContext.evaluate((sel) => {
                    function findElement(root: Document | ShadowRoot | Element): Element | null {
                        const found = root.querySelector(sel);
                        if (found) return found;

                        const allElements = root.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.shadowRoot) {
                                const shadowResult = findElement(el.shadowRoot);
                                if (shadowResult) return shadowResult;
                            }
                        }
                        return null;
                    }

                    const element = findElement(document) as HTMLElement;
                    if (!element) return null;
                    
                    return element.getAttribute('aria-expanded') === 'true';
                }, input.selector);

                if (isExpanded === null) {
                    const duration = Date.now() - startTime;
                    logger.log(`[TOOL] wait_for_accordion_expand | Duration: ${duration}ms | Element not found: ${input.selector}`);
                    return `Error: Element not found with selector: ${input.selector}`;
                }

                if (isExpanded) {
                    const duration = Date.now() - startTime;
                    logger.log(`[TOOL] wait_for_accordion_expand | Duration: ${duration}ms | Accordion expanded`);
                    return `Accordion with selector ${input.selector} is now expanded (aria-expanded="true") after ${duration}ms.`;
                }

                await new Promise((resolve) => setTimeout(resolve, checkInterval));
            }

            const duration = Date.now() - startTime;
            logger.log(`[TOOL] wait_for_accordion_expand | Duration: ${duration}ms | Timeout - accordion not expanded`);
            return `Timeout after ${timeout}ms. Accordion with selector ${input.selector} did not expand (aria-expanded is not "true").`;
        },
        {
            name: "wait_for_accordion_expand",
            description: "Wait for an accordion element to expand by monitoring its aria-expanded attribute. Use this after clicking on an accordion trigger button to ensure the content is visible before interacting with it.",
            schema: z.object({
                selector: z.string().describe("The CSS selector of the accordion trigger element (the button with aria-expanded attribute)."),
                timeout: z.number().optional().describe("Maximum time to wait in milliseconds. Default is 10000 (10 seconds)."),
            }),
        }
    );

    return {
        navigate_to,
        get_page_content,
        element_type,
        element_click,
        wait_for_element,
        wait_for_timeout,
        wait_for_page_load,
        wait_for_text,
        wait_for_accordion_expand,
        element_select_option,
        press_keyboard_key,
        switch_to_frame,
        inspect_accessibility,
        upload_file,
        generate_dummy_pdf,
    };
}