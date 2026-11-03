// Serverless Chromium (Vercel's Node runtime) navigates to the real
// internal/eval-report page and prints it — rather than manually calling
// react-dom/server, which Next's App Router bundler refuses to let a
// Route Handler import ("importing a component that imports
// react-dom/server"). This way the PDF is Next's own normal render of
// EvaluationReportCard, the exact same component the live app shows, with
// zero chance of a second, hand-maintained copy drifting from it.
export async function renderPdfFromUrl(url: string): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const res = await page.goto(url, { waitUntil: 'load' });
    if (!res || !res.ok()) throw new Error(`internal eval-report page returned ${res?.status()}`);
    const pdf = await page.pdf({
      width: '580px',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
