import { Logger } from "@nestjs/common";
import { tool } from "langchain";
import { Browser, KeyInput, Page } from "puppeteer";
import * as z from "zod";

export interface BrowserContext {
    browser: Browser;
    page: Page;
    logger: Logger;
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
            
            // Try regular selector first, fallback to shadow DOM search
            try {
                await context.page.waitForSelector(input.selector, { visible: true, timeout: 2000 });
                await highlight(context, input.selector);
                await context.page.click(input.selector);
                await context.page.type(input.selector, input.text, { delay: 100 });
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
            
            // Try regular selector first, fallback to shadow DOM search
            try {
                await context.page.waitForSelector(input.selector, { visible: true, timeout: 2000 });
                await highlight(context, input.selector);
                await context.page.click(input.selector);
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
            await context.page.waitForSelector(input.selector, { visible: true });
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
            
            const elements = await context.page.evaluate(() => {
                const interactiveSelectors = [
                    'a',
                    'button',
                    'input',
                    'select',
                    'textarea',
                    'label',
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
                    placeholder?: string;
                    value?: string;
                    selector: string;
                    parentId?: number;
                    inShadowDom?: boolean;
                }> = [];

                // Helper function to check if element is visible and interactive
                function isElementVisibleAndInteractive(el: Element): boolean {
                    const htmlEl = el as HTMLElement;
                    const rect = htmlEl.getBoundingClientRect();
                    const style = window.getComputedStyle(htmlEl);

                    const isVisible = 
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none' &&
                        style.opacity !== '0';

                    const isClickable = style.cursor === 'pointer' || 
                        ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].includes(htmlEl.tagName);

                    return isVisible && isClickable;
                }

                // Function to recursively collect VISIBLE and INTERACTIVE elements from shadow DOMs
                function collectElements(root: Document | ShadowRoot | Element, shadowPath: string[] = []): Element[] {
                    const elements: Element[] = [];
                    const selector = interactiveSelectors.join(', ');
                    
                    // Get elements from current root - only add if visible and interactive
                    const found = root.querySelectorAll(selector);
                    found.forEach(el => {
                        if (isElementVisibleAndInteractive(el)) {
                            (el as any).__shadowPath = shadowPath;
                            elements.push(el);
                        }
                    });
                    
                    // Find all elements with shadow roots and recurse
                    const allElements = root.querySelectorAll('*');
                    allElements.forEach((el, index) => {
                        if (el.shadowRoot) {
                            const newPath = [...shadowPath, `[${index}]`];
                            elements.push(...collectElements(el.shadowRoot, newPath));
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

                    const text = htmlEl.innerText?.trim().substring(0, 100) || 
                                 htmlEl.getAttribute('aria-label') || 
                                 htmlEl.getAttribute('title') || 
                                 htmlEl.getAttribute('data-label') ||
                                 '';

                    let parentId: number | undefined;
                    let parent = htmlEl.parentElement;
                    while (parent) {
                        if (elementIndexMap.has(parent)) {
                            parentId = elementIndexMap.get(parent);
                            break;
                        }
                        parent = parent.parentElement;
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
                        placeholder: htmlEl.getAttribute('placeholder') || undefined,
                        value: (htmlEl as HTMLInputElement).value || undefined,
                        selector: selector,
                        parentId: parentId,
                        inShadowDom: inShadowDom || undefined,
                    });
                });

                return results;
            });

            const formatted = elements.map((el, i) => {
                let desc = `[${i}] <${el.tag}`;
                if (el.type) desc += ` type="${el.type}"`;
                if (el.id) desc += ` id="${el.id}"`;
                if (el.name) desc += ` name="${el.name}"`;
                if (el.href) desc += ` href="${el.href.substring(0, 50)}"`;
                if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
                desc += `>`;
                if (el.text) desc += ` "${el.text.substring(0, 50)}"`;
                desc += ` [selector: ${el.selector}]`;
                if (el.inShadowDom) desc += ` [shadow-dom]`;
                if (el.parentId !== undefined) desc += ` [parent: ${el.parentId}]`;
                return desc;
            }).join('\n');

            const shadowCount = elements.filter(e => e.inShadowDom).length;
            const result = `Found ${elements.length} interactive elements (${shadowCount} in Shadow DOM):\n${formatted}`;
            const duration = Date.now() - startTime;
            
            logger.log(`[TOOL] get_page_content | Duration: ${duration}ms | Elements: ${elements.length} | Shadow DOM: ${shadowCount}`);
            
            return result;
        },
        {
            name: "get_page_content",
            description: "Retrieve visible interactive elements from the current page (links, buttons, inputs, selects, labels).",
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

    return {
        navigate_to,
        get_page_content,
        element_type,
        element_click,
        wait_for_element,
        wait_for_timeout,
    };
}