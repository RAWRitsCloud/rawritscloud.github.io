import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const QRCode = require('qrcode');
const { chromium } = require('playwright');

const DATA_FILE = path.resolve('_data/certifications.yml');
const OUT_FILE = path.resolve('assets/JamesM-Credentials.pdf');

const FIRST_NAME = 'James';
const LAST_NAME = 'Murray-Ferris';
const CREDLY_URL = 'https://www.credly.com/users/james.murray-ferris/badges/credly';
const MICROSOFT_URL =
  'https://learn.microsoft.com/en-gb/users/rawritscloud/transcript/71rywhwqmgnym3r?tab=credentials-tab';

// Local fallback so the script also runs on a Mac without Playwright's Chromium.
const LOCAL_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const issuerFor = (title = '', name = '') => {
  if (/hashicorp/i.test(title) || /terraform/i.test(name)) return 'HashiCorp';
  if (/^aws/i.test(name)) return 'AWS';
  return 'Microsoft';
};

function buildRows(data) {
  const active = [];
  for (const section of data.sections ?? []) {
    for (const cert of section.certs ?? []) {
      const issuer = issuerFor(section.title, cert.name);
      active.push({
        name: cert.name,
        issuer,
        level: cert.level ?? '',
        earned: cert.date ?? '',
        expires: cert.expires ?? (issuer === 'Microsoft' ? 'Annual renewal' : ''),
        id: cert.credential_id ?? '',
      });
    }
  }
  const legacy = (data.legacy ?? []).map((item) => ({
    name: item.name,
    issuer: issuerFor('', item.name),
    earned: item.date ?? '',
    status: item.status || 'Retired',
  }));
  return { active, legacy };
}

const levelClass = (level) => `lvl-${String(level).toLowerCase().replace(/[^a-z]/g, '')}`;

function renderHtml({ active, legacy, updated, qrMicrosoft, qrCredly }) {
  const hasIds = active.some((row) => row.id);

  const activeRows = active
    .map(
      (r) => `<tr class="${levelClass(r.level)}">
        <td class="name">${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.issuer)}</td>
        <td><span class="pill ${levelClass(r.level)}">${escapeHtml(r.level)}</span></td>
        <td>${escapeHtml(r.earned)}</td>
        <td>${escapeHtml(r.expires)}</td>
        ${hasIds ? `<td class="mono">${escapeHtml(r.id)}</td>` : ''}
      </tr>`,
    )
    .join('');

  const legacyRows = legacy
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.issuer)}</td>
        <td>${escapeHtml(r.earned) || '&mdash;'}</td>
        <td><span class="status">${escapeHtml(r.status)}</span></td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --navy: #0b1b3a; --blue: #1d6fd6; --muted: #6b7686; --rule: #e6eaf0; }
  html, body { width: 210mm; height: 297mm; }
  body {
    font-family: Inter, 'Helvetica Neue', Arial, sans-serif; color: var(--navy); font-size: 7.9pt;
    background: linear-gradient(180deg, #ffffff 0%, #f5f8fc 100%);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    padding: 9mm 11mm 7mm; display: flex; flex-direction: column; overflow: hidden;
  }
  header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4mm; position: relative; }
  header::before { content: ''; display: block; position: absolute; top: -4mm; left: 0; width: 15mm; height: 0.7mm; background: var(--blue); }
  .first { font-weight: 300; font-size: 17pt; letter-spacing: 0.35em; text-transform: uppercase; margin-top: 4mm; }
  .last { font-weight: 800; font-size: 31pt; letter-spacing: -0.01em; text-transform: uppercase; line-height: 1.05; }
  .sub { font-weight: 400; font-size: 9.5pt; letter-spacing: 0.4em; color: var(--muted); text-transform: uppercase; margin-top: 2.5mm; }
  .updated { border-left: 0.5mm solid var(--blue); padding-left: 3.5mm; margin-bottom: 1mm; }
  .updated small { display: block; font-size: 7pt; letter-spacing: 0.25em; color: var(--muted); text-transform: uppercase; }
  .updated strong { display: block; font-size: 9.5pt; letter-spacing: 0.18em; color: var(--blue); text-transform: uppercase; margin-top: 1mm; }

  .card { background: #fff; border: 0.25mm solid var(--rule); border-radius: 2.5mm; overflow: hidden; margin-bottom: 3.5mm; }
  .card h2 { font-size: 11.5pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 2mm 4mm; }
  .card h2 span { color: var(--blue); }
  .card.dark h2 { background: linear-gradient(90deg, #0b1b3a, #17315f); color: #fff; }
  .card.dark h2 span { color: #6fb0ff; }
  .card.light h2 { padding-bottom: 1.2mm; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 6.6pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--navy); font-weight: 600; background: #f3f6fa; padding: 1.1mm 3mm; }
  td { padding: 0.8mm 3mm; border-top: 0.2mm solid var(--rule); }
  .card.light table { margin: 0 auto; width: calc(100% - 8mm); margin-bottom: 2.5mm; }
  .name { font-weight: 500; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 7.4pt; }
  #active td:first-child { border-left: 0.9mm solid transparent; }
  #active tr.lvl-expert td:first-child { border-left-color: #1d4ed8; }
  #active tr.lvl-associate td:first-child { border-left-color: #1d9bd6; }
  #active tr.lvl-specialty td:first-child { border-left-color: #1d4ed8; }
  #active tr.lvl-fundamental td:first-child { border-left-color: #22a06b; }
  #active tr.lvl-professional td:first-child { border-left-color: #7c3aed; }

  .pill, .status { display: inline-block; padding: 0.2mm 3mm; border-radius: 1mm; font-size: 7.2pt; min-width: 19mm; text-align: center; }
  .pill.lvl-expert { background: #dbe7ff; color: #1d4ed8; }
  .pill.lvl-associate { background: #dcf0fb; color: #12739c; }
  .pill.lvl-specialty { background: #e8e1ff; color: #5b34c9; }
  .pill.lvl-fundamental { background: #dff5ea; color: #15774c; }
  .pill.lvl-professional { background: #ebe3ff; color: #6d28d9; }
  .status { background: #eceff3; color: #5b6573; min-width: 15mm; }

  footer { margin-top: auto; display: flex; justify-content: flex-end; gap: 7mm; align-items: center; border-top: 0.25mm solid var(--rule); padding-top: 3mm; }
  .link { display: flex; align-items: center; gap: 2.5mm; }
  .link img { width: 15mm; height: 15mm; }
  .link b { display: block; font-size: 8pt; color: var(--blue); }
  .link span { display: block; font-size: 6.4pt; color: var(--muted); max-width: 33mm; line-height: 1.35; margin-top: 0.5mm; }
  footer .meta { margin-right: auto; font-size: 6.2pt; letter-spacing: 0.14em; color: var(--muted); text-transform: uppercase; }
</style></head>
<body>
  <header>
    <div>
      <div class="first">${escapeHtml(FIRST_NAME)}</div>
      <div class="last">${escapeHtml(LAST_NAME)}</div>
      <div class="sub">Certifications &amp; Credentials</div>
    </div>
    <div class="updated"><small>Last updated</small><strong>${escapeHtml(updated)}</strong></div>
  </header>

  <section class="card dark" id="active">
    <h2>Active certifications <span>(${active.length})</span></h2>
    <table>
      <thead><tr><th>Certification</th><th>Issuer</th><th>Level</th><th>Earned</th><th>Expires / Renewal</th>${hasIds ? '<th>Credential ID</th>' : ''}</tr></thead>
      <tbody>${activeRows}</tbody>
    </table>
  </section>

  <section class="card light">
    <h2>Legacy &amp; expired certifications <span>(${legacy.length})</span></h2>
    <table>
      <thead><tr><th>Certification</th><th>Issuer</th><th>Earned</th><th>Status</th></tr></thead>
      <tbody>${legacyRows}</tbody>
    </table>
  </section>

  <footer>
    <div class="meta">${escapeHtml(FIRST_NAME)} ${escapeHtml(LAST_NAME)} &nbsp;|&nbsp; Certifications &amp; Credentials<br>Last updated ${escapeHtml(updated)}</div>
    <div class="link"><img src="${qrMicrosoft}" alt=""><div><b>Microsoft Learn Transcript</b><span>View my full, up-to-date Microsoft certification transcript.</span></div></div>
    <div class="link"><img src="${qrCredly}" alt=""><div><b>Credly</b><span>View and verify my credentials on Credly.</span></div></div>
  </footer>
</body></html>`;
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    for (const executablePath of LOCAL_BROWSERS) {
      if (fsSync.existsSync(executablePath)) return chromium.launch({ executablePath });
    }
    throw error;
  }
}

async function main() {
  const data = yaml.load(await fs.readFile(DATA_FILE, 'utf8'));
  const { active, legacy } = buildRows(data);

  const qrOptions = { margin: 0, width: 240, color: { dark: '#0b1b3a', light: '#ffffff' } };
  const html = renderHtml({
    active,
    legacy,
    updated: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    qrMicrosoft: await QRCode.toDataURL(MICROSOFT_URL, qrOptions),
    qrCredly: await QRCode.toDataURL(CREDLY_URL, qrOptions),
  });

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => page.setContent(html));
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.body.scrollHeight - document.body.clientHeight,
    );
    if (overflow > 1) {
      throw new Error(`Credentials PDF content overflows one A4 page by ${overflow}px; tighten the layout.`);
    }
    await page.pdf({ path: OUT_FILE, format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${active.length} active, ${legacy.length} legacy)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
