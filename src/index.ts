//

import * as fs from "fs";

import * as puppeteer from "puppeteer";

interface NodeInfo {
  url: string;
  refs: string[];
  title: string;
  error?: string;
}

type CheckerOptions = {
  checkHost: string;
  outputHost?: string;
  paths: string[];
  blackList?: string[];
  checkExternalLinks?: boolean;
  sitemapPath?: string;
};

class Checker {
  private readonly browser: puppeteer.Browser;
  private readonly page: puppeteer.Page;
  private readonly checkExternalLinks: boolean;
  private readonly sitemapPath: string | null;
  private readonly checkHost: string;
  private readonly outputHost: string;
  private readonly blackList: string[];

  private readonly allNodes: Map<string, NodeInfo> = new Map<
    string,
    NodeInfo
  >();
  private readonly finishedOurNodes: Set<NodeInfo> = new Set<NodeInfo>();
  private readonly errorNodes: Set<NodeInfo> = new Set<NodeInfo>();
  private readonly targetNodes: Set<NodeInfo> = new Set<NodeInfo>();

  public static async run(options: CheckerOptions): Promise<void> {
    const checker = await Checker.factory(options);
    await checker.runInternal(options.paths);
  }

  private constructor(
    browser: puppeteer.Browser,
    page: puppeteer.Page,
    options: CheckerOptions
  ) {
    this.browser = browser;
    this.page = page;
    this.checkHost = options.checkHost;
    this.outputHost =
      typeof options.outputHost === "undefined"
        ? options.checkHost
        : options.outputHost;
    this.checkExternalLinks = options.checkExternalLinks === true;
    this.sitemapPath =
      typeof options.sitemapPath === "string" ? options.sitemapPath : null;
    this.blackList =
      typeof options.blackList === "undefined" ? [] : options.blackList;
  }

  private static async factory(options: CheckerOptions): Promise<Checker> {
    const browser = await puppeteer.launch({ headless: true });
    await browser.createIncognitoBrowserContext();
    const page = await browser.newPage();

    return new Checker(browser, page, options);
  }

  public async runInternal(paths: string[]): Promise<void> {
    paths.forEach(path => {
      const newNode = {
        url: path,
        refs: [],
        title: ""
      };
      this.allNodes.set(newNode.url, newNode);
      this.targetNodes.add(newNode);
    });

    while (this.targetNodes.size > 0) {
      const nodeInfo = Array.from(this.targetNodes).sort((a, b) =>
        a.url.localeCompare(b.url)
      )[0];
      this.targetNodes.delete(nodeInfo);
      await this.checkPage(nodeInfo);
    }
    await this.close();
    // console.log(JSON.stringify(Array.from(this.finishedOurNodes), null, 2));
    this.writeSitemap();
  }

  private static async wait(waitMillisec: number): Promise<void> {
    return new Promise((resolve): void => {
      setTimeout(resolve, waitMillisec);
    });
  }

  private async close(): Promise<void> {
    await this.browser.close();
  }

  private async checkPage(nodeInfo: NodeInfo): Promise<void> {
    const rawUrl = nodeInfo.url;
    const checkUrl =
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
        ? rawUrl
        : `${this.checkHost}${rawUrl}`;

    const isExternalLink = !checkUrl.startsWith(this.checkHost);
    if (isExternalLink && !this.checkExternalLinks) {
      return;
    }

    console.log(`checking ${isExternalLink ? "External " : ""}${checkUrl}`);

    try {
      const res = await this.page.goto(checkUrl, {
        waitUntil: "load",
        timeout: 10000
      });

      await Checker.wait(500);

      if (res === null) {
        // throw new Error(`null`);
      } else {
        const status = res.status();
        // console.log(res);
        if (status < 200 || status >= 400) {
          throw new Error(`Status: ${status}`);
        }
      }
      // eslint-disable-next-line require-atomic-updates
      nodeInfo.title = await this.page.title();
    } catch (ex) {
      console.log(`  ${checkUrl}: ${ex.toString()}`);
      // eslint-disable-next-line require-atomic-updates
      nodeInfo.error = ex.toString();
      this.errorNodes.add(nodeInfo);
      return;
    }

    if (isExternalLink) {
      return;
    }

    this.finishedOurNodes.add(nodeInfo);

    const links = await this.page.$$("a");
    for (let i = 0; i < links.length; i++) {
      const hrefObj = await links[i].getProperty("href");
      const href = await hrefObj.jsonValue();
      let strippedHref: string;
      if (href.startsWith(this.checkHost)) {
        strippedHref = href.substr(this.checkHost.length);
      } else {
        strippedHref = href;
      }
      const refNodeInfo = this.allNodes.get(strippedHref);
      if (typeof refNodeInfo === "undefined") {
        const newNodeInfo = {
          url: strippedHref,
          refs: [nodeInfo.url],
          title: ""
        };
        this.allNodes.set(strippedHref, newNodeInfo);
        this.targetNodes.add(newNodeInfo);
      } else if (refNodeInfo.refs.indexOf(nodeInfo.url) < 0) {
        refNodeInfo.refs.push(nodeInfo.url);
      }
    }
  }

  private writeSitemap(): void {
    if (this.sitemapPath === null) {
      return;
    }
    let sitemap = "";
    sitemap +=
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    const nodes = Array.from(this.finishedOurNodes).sort((a, b) =>
      a.url.localeCompare(b.url)
    );
    nodes.forEach(nodeInfo => {
      if (this.blackList.indexOf(nodeInfo.url) >= 0) {
        return;
      }
      sitemap +=
        `  <url>\n` +
        `    <loc>${this.outputHost}${nodeInfo.url}</loc>\n` +
        `  </url>\n`;
    });

    sitemap += `</urlset>`;

    fs.writeFileSync(this.sitemapPath, sitemap, "utf-8");
  }
}

const run = async (): Promise<void> => {
  Checker.run({
    checkHost: "http://127.0.0.1:3000",
    outputHost: "https://bugfire.dev",
    paths: ["/"],
    blackList: ["/#/"],
    checkExternalLinks: false,
    sitemapPath: "build/sitemap.xml"
  });
};

run();
