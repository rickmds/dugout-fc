import ReactDOMServer from 'react-dom/server';
import { EvaluationReportCard, type EvalRow } from '@/components/dashboard/evaluation/EvaluationReport';

// Renders the exact same card markup EvaluationReportPanel shows live
// (same component, via react-dom/server) so the PDF a parent receives by
// email can never visually drift from what the app itself shows — no
// second, hand-maintained copy of the design to keep in sync.
export function renderEvaluationReportHtml(opts: {
  ev: EvalRow; primary: string; clubLogoUrl: string | null; clubName: string;
}): string {
  const inner = ReactDOMServer.renderToStaticMarkup(
    <EvaluationReportCard ev={opts.ev} primary={opts.primary} clubLogoUrl={opts.clubLogoUrl} clubName={opts.clubName} />
  );
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 20px; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
</style>
</head>
<body>
${inner}
</body>
</html>`;
}

// Serverless Chromium (Vercel's Node runtime, not the edge runtime) —
// dynamic imports because @sparticuz/chromium pulls in Node-only APIs
// that would otherwise break any accidental non-Node bundling of this file.
export async function renderPdfFromHtml(html: string): Promise<Buffer> {
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
    await page.setContent(html, { waitUntil: 'load' });
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
