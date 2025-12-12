import { firefox } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

class RedditCrawler {
  private delay: number;
  public browser: Browser | null = null;
  public context: BrowserContext | null = null;

  constructor(delay = 2000) {
    this.delay = delay;
  }

  async findMultis(username: string): Promise<string[]> {
    if (!this.browser || !this.context) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    const page = await this.context.newPage();
    await page.goto(`https://www.reddit.com/user/${username}`, {
      waitUntil: "domcontentloaded",
    });

    console.log(
      "Navigated to user page, waiting left-nav-multireddits-controller",
    );
    // Wait for content to load
    await page.waitForSelector("left-nav-multireddits-controller", {
      timeout: 10000,
    });
    console.log("Navigated to user page, waiting ok");

    // Extract multireddit links
    const multiredditNames = await page.evaluate(() => {
      const ctrlr = document.querySelector("left-nav-multireddits-controller");
      const ctrlr_sr = ctrlr?.shadowRoot;
      const ctrlr_items = ctrlr_sr?.querySelectorAll(
        "left-nav-multireddit-item",
      );
      const items = Array.from(ctrlr_items ?? [])
        .map((x) => x.getAttribute("multiredditpath")?.split("/").at(-2))
        .filter((x) => x !== undefined);

      console.log("Found multis");
      console.log(ctrlr);
      console.log(ctrlr_sr);
      console.log(ctrlr_items);
      console.log(items);
      return items;
    });

    // If we didn't find any multireddits in the page, try the old Reddit layout
    return multiredditNames;
  }

  /**
   * Initialize the browser and login with username/password
   */
  async init(): Promise<void> {
    try {
      // Launch browser in non-headless mode to see what's happening
      this.browser = await firefox.launch({
        headless: process.env.HEADLESS === "true",
      });

      // Create context with Reddit-like user agent and viewport
      this.context = await this.browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1400, height: 800 },
        locale: "en-US",
      });

      // Login with username and password
      await this.login();

      console.log("Browser initialized and logged in");
    } catch (error) {
      console.error("Error initializing browser:", error);
      throw error;
    }
  }

  /**
   * Login to Reddit using username and password
   */
  async login(): Promise<void> {
    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;

    if (!username || !password) {
      throw new Error(
        "USERNAME and PASSWORD environment variables must be set",
      );
    }

    const page = await this.context.newPage();

    try {
      console.log("Navigating to Reddit login page...");

      // Go to Reddit login page
      await page.goto("https://www.reddit.com/login", {
        waitUntil: "domcontentloaded",
      });

      // Wait for login form to load
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });

      console.log("Filling login form...");

      // Fill in the username
      await page.fill('input[name="username"]', username);

      // Fill in the password
      await page.fill('input[name="password"]', password);

      // Small delay to ensure form is ready
      await page.waitForTimeout(500);

      // Find and click the login button - try multiple selectors
      const loginButton = page
        .locator(
          'button[type="submit"]:has-text("Log In"), button:has-text("Log In"), fieldset button[type="submit"], .AnimatedForm button[type="submit"]',
        )
        .first();

      // Check if button was found
      const buttonCount = await loginButton.count();
      console.log(`Found ${buttonCount} matching login button(s)`);

      if (buttonCount > 0) {
        const buttonText = await loginButton.textContent();
        console.log(`Clicking login button with text: "${buttonText}"`);
        await loginButton.click();
      } else {
        // Fallback: try to find any submit button in the form
        console.log("Primary selectors failed, trying fallback...");
        const submitButton = page.locator('form button[type="submit"]').first();
        const fallbackCount = await submitButton.count();
        if (fallbackCount > 0) {
          const buttonText = await submitButton.textContent();
          console.log(`Clicking fallback button with text: "${buttonText}"`);
          await submitButton.click();
        } else {
          throw new Error("Could not find login button on page");
        }
      }

      // Wait for navigation after login - either success or error
      console.log("Waiting for login response...");
      console.log("Current URL:", page.url());

      try {
        // Wait for Reddit to redirect away from the login page
        await page.waitForURL(/^https:\/\/www\.reddit\.com\/?(?!login)/, {
          timeout: 15000,
        });
        console.log("Redirected from login page");

        // Give Reddit time to establish the session
        await page.waitForTimeout(3000);

        // Wait for the page to fully load
        await page.waitForLoadState("domcontentloaded");

        // Try to wait for user indicator elements
        await page
          .waitForSelector(
            '[data-testid="user-dropdown-button"], #USER_DROPDOWN, button[aria-label*="User account"], [data-testid="header-user-dropdown"], [id*="email-collection"]',
            { timeout: 5000 },
          )
          .catch(() => {
            console.log(
              "User dropdown not found, checking other indicators...",
            );
          });
      } catch (error) {
        console.log("No redirect detected, checking for login error...");

        // Check if there's an error message on the login page
        const hasError = await page.$$eval(
          ".AnimatedForm__errorMessage, .status-error",
          (elements) => elements.length > 0,
        );

        if (hasError) {
          const errorMessage = await page.evaluate(() => {
            const errorElement = document.querySelector(
              ".AnimatedForm__errorMessage, .status-error",
            );
            return errorElement?.textContent || null;
          });
          throw new Error(`Login failed: ${errorMessage}`);
        }
      }

      console.log("Final URL after login:", page.url());

      // Check if login was successful by looking for user dropdown or username
      const isLoggedIn = await page.evaluate(() => {
        return (
          document.querySelector(
            '[data-testid="user-dropdown-button"], #USER_DROPDOWN, button[aria-label*="User account"], [data-testid="header-user-dropdown"]',
          ) !== null ||
          // Also check if we're no longer on the login page
          !window.location.pathname.includes("/login")
        );
      });

      if (isLoggedIn) {
        console.log(`Successfully logged in as ${username}`);
      } else {
        // Check if there's an error message
        const errorMessage = await page.evaluate(() => {
          const errorElement = document.querySelector(
            ".AnimatedForm__errorMessage, .status-error",
          );
          return errorElement?.textContent || null;
        });

        if (errorMessage) {
          throw new Error(`Login failed: ${errorMessage}`);
        } else {
          throw new Error("Login failed: Could not verify login status");
        }
      }

      await page.close();
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  async crawlMultireddit(user: string, multireddit: string): Promise<string[]> {
    if (!this.browser || !this.context) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    try {
      const page = await this.context.newPage();

      console.log(`Visiting /user/${user}/m/${multireddit}...`);

      // Navigate to the subreddit
      await page.goto(`https://www.reddit.com/user/${user}/m/${multireddit}`, {
        waitUntil: "domcontentloaded",
      });

      // Wait for some content to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Check for age verification or NSFW warning
      const hasAgeGate = await this.checkAndHandleAgeGate(page);

      if (hasAgeGate) {
        console.log("Handled age verification prompt");
        // Wait for navigation after clicking the button
        await page.waitForLoadState("networkidle");
        await page.waitForSelector("custom-feed-community-list");
      }

      // Try to find and click "view all" button to expand the subreddit list
      try {
        // Wait for the page to be fully interactive
        await page.waitForTimeout(3000);

        const buttonClicked = await page.evaluate(async () => {
          const communityList = document.querySelector(
            "custom-feed-community-list",
          );
          if (communityList && communityList.shadowRoot) {
            const editButton = communityList.shadowRoot.querySelector(
              "custom-feed-edit-button",
            );
            if (editButton instanceof HTMLElement) {
              editButton.click();
              return true;
            }
          }
          return false;
        });

        if (buttonClicked) {
          console.log("Edit button clicked, waiting for popup...");
          await page.waitForTimeout(2000);
        } else {
          console.log("Edit button not found");
        }
      } catch (error) {
        console.log("Error clicking edit button:", error);
      }
      // Extract links to other subreddits
      const subredditLinks = await this.extractSubredditLinks(page);

      // Close the page to free resources
      await page.close();

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, this.delay));

      console.log(
        `Found ${subredditLinks.length} subreddit links on /user/${user}/m/${multireddit}`,
      );
      return subredditLinks;
    } catch (error) {
      console.error(`Error crawling /user/${user}/m/${multireddit}:`, error);
      return [];
    }
  }

  /**
   * Visit a subreddit and extract links to other subreddits
   * @param subreddit - The subreddit to visit (without r/ prefix)
   * @returns Array of discovered subreddits
   */
  async crawlSubreddit(subreddit: string): Promise<string[]> {
    if (!this.browser || !this.context) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    try {
      const page = await this.context.newPage();
      const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");

      console.log(`Visiting r/${normalizedSubreddit}...`);

      // Navigate to the subreddit
      await page.goto(`https://www.reddit.com/r/${normalizedSubreddit}`, {
        waitUntil: "domcontentloaded",
      });

      // Wait for some content to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Check for age verification or NSFW warning
      const hasAgeGate = await this.checkAndHandleAgeGate(page);

      if (hasAgeGate) {
        console.log("Handled age verification prompt");
        // Wait for navigation after clicking the button
        await page.waitForLoadState("domcontentloaded");
      }

      // Extract links to other subreddits
      const subredditLinks = await this.extractSubredditLinks(page);

      // Close the page to free resources
      await page.close();

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, this.delay));

      console.log(
        `Found ${subredditLinks.length} subreddit links on r/${normalizedSubreddit}`,
      );
      return subredditLinks;
    } catch (error) {
      console.error(`Error crawling r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Check for and handle age verification prompts
   */
  private async checkAndHandleAgeGate(page: Page): Promise<boolean> {
    const hasAgeGate = await page.$$eval(
      'button:has-text("Yes"), button:has-text("Continue"), button:has-text("I AM OVER")',
      (buttons) => buttons.length > 0,
    );

    if (hasAgeGate) {
      console.log("Accepting age verification prompt...");
      await page.click(
        'button:has-text("Yes"), button:has-text("Continue"), button:has-text("I AM OVER")',
      );
      return true;
    }

    return false;
  }

  /**
   * Extract links to other subreddits from the page
   */
  private async extractSubredditLinks(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const links: string[] = [];

      // Process a link to see if it's a subreddit link
      const processLink = (link: string | null): string | null => {
        if (!link) return null;

        // Parse subreddit from href
        const match = link.match(/\/r\/([a-zA-Z0-9_]+)(?:\/|\?|$)/);
        if (match && match[1]) {
          return match[1].toLowerCase();
        }
        return null;
      };

      document.querySelectorAll("custom-feed-community-list").forEach((list) =>
        list
          .querySelectorAll('li a[href^="/r/"][target="_blank"]')
          .forEach((element) => {
            const subreddit = processLink(element.getAttribute("href"));
            if (subreddit) {
              links.push(subreddit);
            }
          }),
      );

      // Remove duplicates
      return [...new Set(links)];
    });
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}

export default RedditCrawler;
