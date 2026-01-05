import puppeteer, { Browser, Page } from "puppeteer";
import { fa } from "zod/v4/locales";


export class BrowserInstance {
    private instance: {browser: Browser; page: Page} | undefined;

    async createBrowserInstance(): Promise<void> {
        const browser = await puppeteer.launch({ headless: false, 
            args: [
                    '--disable-gpu',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--disable-notifications',
                    '--disable-extensions',
                    '--disable-popup-blocking',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--metrics-recording-only',
                    '--mute-audio',
                    '--disable-features=PasswordLeakDetection,PasswordCheck,PasswordChangeInSettings,PasswordImport,PasswordManagerRedesign,SafeBrowsingEnhancedProtection,PasswordGeneration,PasswordManagerOnboarding',
                    '--disable-save-password-bubble',
                    '--disable-password-generation',
                    '--disable-password-manager-reauthentication',
                    '--password-store=basic',
                    '--disable-component-update',
                    '--disable-default-apps',
                    '--disable-sync'
                ],
                defaultViewport: { width: 1366, height: 768 },

            });
        
        const pages = await browser.pages();
        const page = pages[0] ?? await browser.newPage();

        this.instance = { browser, page };
    }

    public get browserInstance(): {browser: Browser; page: Page} | undefined {
        return this.instance;
    }

}