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

    const element_type = tool(
        async (input) => {
            const startTime = Date.now();
            await removeHighlight(context);
            await context.page.waitForSelector(input.selector, { visible: true });
            await highlight(context, input.selector);
            await context.page.click(input.selector);
            await context.page.type(input.selector, input.text, { delay: 100 });
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] element_type | Duration: ${duration}ms | Selector: ${input.selector}`);
            return `Typed text into element with selector ${input.selector}`;
        },
        {
            name: "element_type",
            description: "Type text into an element specified by a CSS selector. Input should be a JSON object with 'selector' and 'text' fields.",
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
            await context.page.waitForSelector(input.selector, { visible: true });
            await highlight(context, input.selector);
            await context.page.click(input.selector);
            const duration = Date.now() - startTime;
            logger.log(`[TOOL] element_click | Duration: ${duration}ms | Selector: ${input.selector}`);
            return `Clicked element with selector ${input.selector}`;
        },
        {
            name: "element_click",
            description: "Click an element specified by a CSS selector. Input should be a JSON object with a 'selector' field.",
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
                }> = [];

                const allElements = document.querySelectorAll(interactiveSelectors.join(', '));
                const elementsList = Array.from(allElements);
                const elementIndexMap = new Map<Element, number>();

                elementsList.forEach((el) => {
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

                    if (isVisible && isClickable) {
                        const getUniqueSelector = (element: HTMLElement): string => {
                            
                            if (element.id) {
                                const idSelector = `#${CSS.escape(element.id)}`;
                                if (document.querySelectorAll(idSelector).length === 1) {
                                    return idSelector;
                                }
                            }

                            const path: string[] = [];
                            let current: HTMLElement | null = element;

                            while (current && current !== document.body) {
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

                        const selector = getUniqueSelector(htmlEl);

                        const text = htmlEl.innerText?.trim().substring(0, 100) || 
                                     htmlEl.getAttribute('aria-label') || 
                                     htmlEl.getAttribute('title') || '';

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
                        });
                    }
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
                if (el.parentId !== undefined) desc += ` [parent: ${el.parentId}]`;
                return desc;
            }).join('\n');

            const result = `Found ${elements.length} interactive elements:\n${formatted}`;
            const duration = Date.now() - startTime;
            
            logger.log(`[TOOL] get_page_content | Duration: ${duration}ms | Elements: ${elements.length}`);
            
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