// Serverless Chromium (Vercel's Node runtime) navigates to the real
// internal/eval-report page and prints it — rather than manually calling
// react-dom/server, which Next's App Router bundler refuses to let a
// Route Handler import ("importing a component that imports
// react-dom/server"). This way the PDF is Next's own normal render of
// EvaluationReportCard, the exact same component the live app shows, with
// zero chance of a second, hand-maintained copy drifting from it.
// Full @sparticuz/chromium bundles a 67MB Chromium binary, over Vercel's
// function size limit — it deploys but the binary silently doesn't make it
// into the function. chromium-min ships no binary at all and instead
// downloads this exact version's prebuilt pack from the package's own
// GitHub release on cold start (cached per warm instance). Pin the version
// in the URL to the installed package's version, in lockstep with it —
// bumping @sparticuz/chromium-min without updating this URL would fetch a
// mismatched Chromium build.
const CHROMIUM_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

export async function renderPdfFromUrl(url: string): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium-min'),
    import('puppeteer-core'),
  ]);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });
  try {
    const width = 580;
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1200 });
    const res = await page.goto(url, { waitUntil: 'load' });
    if (!res || !res.ok()) throw new Error(`internal eval-report page returned ${res?.status()}`);
    // 'load' can fire on the initial streamed Suspense fallback shell,
    // before the real report streams in and replaces it. waitForSelector
    // alone isn't enough either — it only confirms the node exists in the
    // DOM, not that layout has actually settled, and proved flaky in
    // practice (page.pdf() would sometimes still capture a near-empty
    // page even after the selector resolved). Polling the element's real
    // measured height forces Puppeteer to query actual layout, not just
    // DOM presence, until the report has visibly rendered.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-report-ready="true"]');
        return !!el && el.getBoundingClientRect().height > 300;
      },
      { timeout: 15000 },
    );
    // The report is one continuous card, never meant to paginate — size
    // the PDF page to the content's real rendered height instead of
    // defaulting to Letter, which split it across two pages with the
    // second almost entirely blank.
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    const pdf = await page.pdf({
      width: `${width}px`,
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
