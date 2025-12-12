import { firefox } from "playwright";
import type { Browser, BrowserContext, Page, Cookie } from "playwright";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import sqlite3 from "sqlite3";

class RedditCrawler {
  private cookiesFilePath: string;
  private delay: number;
  public browser: Browser | null = null;
  public context: BrowserContext | null = null;

  constructor(cookiesFilePath: string, delay = 2000) {
    this.cookiesFilePath = cookiesFilePath;
    this.delay = delay;
  }

  async findMultis(username: string): Promise<string[]> {
    if (!this.browser || !this.context) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    const page = await this.context.newPage();
    await page.goto(`https://www.reddit.com/user/${username}`, {
      waitUntil: "networkidle",
    });

    // Wait for content to load
    await page.waitForSelector("body", { timeout: 10000 });

    // Extract multireddit links
    const multiredditNames = await page.evaluate((user) => {
      const links: string[] = [];

      document
        .querySelectorAll(`a[href*="/user/${user}/m/"]`)
        .forEach((element) => {
          const href = element.getAttribute("href");
          if (href) {
            // Extract multireddit name from URL
            const match = href.match(/\/(?:user|u)\/[^\/]+\/m\/([^\/\?]+)/);
            if (match && match[1]) {
              links.push(match[1]);
            }
          }
        });

      // Remove duplicates
      return [...new Set(links)];
    }, username);

    // If we didn't find any multireddits in the page, try the old Reddit layout
    return multiredditNames;
  }

  /**
   * Initialize the browser with cookies from the provided cookies file
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
        viewport: { width: 960, height: 540 },
        locale: "en-US",
      });
      await this.loadCookies();
      // Navigate to Reddit first before adding cookies
      const page = await this.context.newPage();
      await page.goto("https://www.reddit.com", {
        waitUntil: "domcontentloaded",
      });

      // Load cookies from file

      // Refresh the page to apply cookies
      await page.reload({ waitUntil: "networkidle" });

      // Verify cookies are working by checking if we're logged in
      const isLoggedIn = await page.evaluate(() => {
        // Check for user menu or login button
        return (
          document.querySelector(
            '[data-testid="user-dropdown-button"], #USER_DROPDOWN',
          ) !== null
        );
      });

      if (isLoggedIn) {
        console.log("Browser initialized with cookies - user is logged in");
      } else {
        console.warn(
          "Browser initialized with cookies - but user appears not logged in",
        );
      }

      await page.close();

      console.log("Browser initialized with cookies");
    } catch (error) {
      console.error("Error initializing browser:", error);
      throw error;
    }
  }

  /**
   * Load Reddit cookies from Firefox's cookies.sqlite file
   */
  async loadCookies(): Promise<void> {
    try {
      // Validate that cookies file exists
      if (!existsSync(this.cookiesFilePath)) {
        throw new Error(
          `Firefox cookies.sqlite file not found at: ${this.cookiesFilePath}`,
        );
      }

      try {
        // Create a temporary copy of the cookies database to avoid lock issues
        const tempDir = os.tmpdir();
        const tempCookiesPath = path.join(
          tempDir,
          `cookies-${Date.now()}.sqlite`,
        );

        try {
          // Copy the cookies file to a temporary location
          await fs.copyFile(this.cookiesFilePath, tempCookiesPath);
          console.log(
            `Created temporary copy of cookies database at ${tempCookiesPath}`,
          );
        } catch (copyError) {
          console.error("Error copying cookies database:", copyError);
          throw new Error(
            "Failed to copy Firefox cookies database. Make sure Firefox profile path is correct.",
          );
        }

        const db = new sqlite3.Database(tempCookiesPath, sqlite3.OPEN_READONLY);

        // Query to get Reddit cookies from Firefox's cookies.sqlite
        const rows: any[] = await new Promise((resolve, reject) => {
          db.all(
            `
            SELECT name, value, host as domain, path, expiry as expires,
                   isSecure as secure, isHttpOnly as httpOnly
            FROM moz_cookies
            WHERE host LIKE '%reddit%'
            `,
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            },
          );
        });

        // Close the database
        await new Promise<void>((resolve, reject) => {
          db.close((err) => {
            if (err) {
              console.error("Error closing cookies database:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // Clean up temporary file
        try {
          await fs.unlink(tempCookiesPath);
          console.log("Cleaned up temporary cookies file");
        } catch (unlinkError) {
          console.warn("Could not delete temporary cookies file:", unlinkError);
        }

        if (!rows || rows.length === 0) {
          console.warn("No Reddit cookies found in Firefox cookies.sqlite");
          return;
        }

        // Debug: log raw cookie values
        console.log(
          "Raw cookies from Firefox:",
          rows.map((c) => ({
            name: c.name,
            expires: c.expires,
            domain: c.domain,
          })),
        );

        // Convert Firefox cookie format to Playwright format
        const playwrightCookies = rows.map((cookie: any) => {
          // Firefox expiry: 0 means session cookie, positive number is Unix timestamp in microseconds
          // Playwright expects: undefined for session cookies, positive Unix timestamp in seconds
          let expiresValue;
          if (!cookie.expires || cookie.expires === 0) {
            expiresValue = undefined; // Session cookie
          } else if (cookie.expires > 0) {
            // Firefox stores in microseconds, convert to seconds
            expiresValue = Math.floor(cookie.expires / 1000000);
          } else {
            console.warn(
              `Unexpected expires value for cookie ${cookie.name}: ${cookie.expires}`,
            );
            expiresValue = undefined;
          }

          return {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain.startsWith(".")
              ? cookie.domain
              : cookie.domain, // Don't add dot prefix automatically
            path: cookie.path || "/",
            expires: expiresValue,
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.httpOnly),
            sameSite: "None" as const, // Changed from "Lax" to "None" for cross-site cookies
          };
        });

        // Add cookies to browser context
        await this.context?.addCookies(playwrightCookies);
        console.log(
          `Loaded ${playwrightCookies.length} Reddit cookies from Firefox`,
        );

        // Debug: Log some important cookies to verify they're set
        const importantCookies = playwrightCookies.filter((c) =>
          ["reddit_session", "token_v2", "edgebucket", "loid", "pc"].includes(
            c.name,
          ),
        );
        if (importantCookies.length > 0) {
          console.log(
            "Important cookies loaded:",
            importantCookies.map((c) => c.name).join(", "),
          );
        }
      } catch (e) {
        console.error("Error reading cookies from Firefox cookies.sqlite:", e);
        throw new Error("Failed to extract cookies from Firefox");
      }
    } catch (error) {
      console.error("Error loading cookies:", error);
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
        waitUntil: "networkidle",
      });

      // Wait for some content to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Check for age verification or NSFW warning
      const hasAgeGate = await this.checkAndHandleAgeGate(page);

      if (hasAgeGate) {
        console.log("Handled age verification prompt");
        // Wait for navigation after clicking the button
        await page.waitForLoadState("networkidle");
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
   * Save current browser context cookies to a JSON file
   * Useful for backing up working cookiesync crawlMultireddit(user: string, multireddit: string): Promise<string[]> {
    if (!this.browser || !this.context) {
      throw new Error("Browser not initialized. Call init() first.");
    }

    try {
      const page = await this.context.newPage();

      console.log(`Visiting /user/${user}/m/${multireddit}`);

      // Navigate to the multireddit
      await page.goto(`https://www.reddit.com/user/${user}/m/${multireddit}`, {
        waitUntil: "networkidle",
      });

      // Wait for some content to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Check for age verification or NSFW warning
      const hasAgeGate = await this.checkAndHandleAgeGate(page);

      if (hasAgeGate) {
        console.log("Handled age verification prompt");
        // Wait for navigation after clicking the button
        await page.waitForLoadState("networkidle");
      }

      // Extract links to other subreddits
      const subredditLinks = await this.extractSubredditLinks(page);

      // Close the page to free resources
      await page.close();

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, this.delay));

      console.log(
        `Found ${subredditLinks.length} subreddits in /user/${user}/m/${multireddit}`,
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
        waitUntil: "networkidle",
      });

      // Wait for some content to load
      await page.waitForSelector("body", { timeout: 10000 });

      // Check for age verification or NSFW warning
      const hasAgeGate = await this.checkAndHandleAgeGate(page);

      if (hasAgeGate) {
        console.log("Handled age verification prompt");
        // Wait for navigation after clicking the button
        await page.waitForLoadState("networkidle");
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

      // Get all links on the page
      document
        .querySelectorAll(
          '#right-sidebar-container li a[href^="/r/"][target="_blank"]',
        )
        .forEach((element) => {
          const subreddit = processLink(element.getAttribute("href"));
          if (subreddit) {
            links.push(subreddit);
          }
        });

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
