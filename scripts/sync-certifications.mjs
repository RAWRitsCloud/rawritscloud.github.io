import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MICROSOFT_URL =
  'https://learn.microsoft.com/en-gb/users/rawritscloud/transcript/71rywhwqmgnym3r?tab=credentials-tab';

const CREDLY_URL =
  'https://www.credly.com/users/james.murray-ferris/badges/credly';

const DATA_FILE = path.resolve('_data/certifications.yml');
const ARTIFACT_DIR = path.resolve('artifacts/cert-sync');
const MAX_CREDLY_DETAIL_PAGES = 100;

const clean = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const normaliseName = (value = '') =>
  clean(value)
    .replace(/[®™]/g, '')
    .replace(/^microsoft certified:\s*/i, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];

    if (typeof value === 'string' && clean(value)) {
      return clean(value);
    }
  }

  return '';
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return '';
}

function isMicrosoftCertificationName(name) {
  const value = clean(name);

  if (!value || value.length > 180) {
    return false;
  }

  const product =
    /(azure|microsoft 365|windows server|security|identity|power platform|fabric|dynamics 365|devops|cybersecurity)/i;

  const level =
    /(expert|associate|specialty|fundamentals?|administrator|engineer|architect|developer)/i;

  return product.test(value) && level.test(value);
}

function isHashiCorpCredential(item) {
  return (
    /hashicorp/i.test(item.issuer || '') ||
    /(terraform|vault|consul|nomad)\b/i.test(item.name || '')
  );
}

function isMicrosoftCredential(item) {
  return (
    /microsoft/i.test(item.issuer || '') ||
    isMicrosoftCertificationName(item.name)
  );
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function displayDate(value) {
  if (!value) {
    return '';
  }

  const parsed = parseDate(value);

  if (!parsed) {
    return clean(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function isExpired(item) {
  if (/expired|inactive|retired|revoked/i.test(item.status || '')) {
    return true;
  }

  const expires = parseDate(item.expires);
  return Boolean(expires && expires < new Date());
}

function inferLevel(name) {
  if (/expert/i.test(name)) return 'Expert';
  if (/associate/i.test(name)) return 'Associate';
  if (/specialty/i.test(name)) return 'Specialty';
  if (/fundamental/i.test(name)) return 'Fundamental';
  if (/professional/i.test(name)) return 'Professional';
  return 'Certification';
}

function microsoftSection(name) {
  switch (inferLevel(name)) {
    case 'Expert':
      return 'Microsoft Azure — Expert';
    case 'Associate':
      return 'Microsoft Azure — Associate';
    case 'Specialty':
      return 'Microsoft Azure — Specialty';
    case 'Fundamental':
      return 'Microsoft — Fundamentals';
    default:
      return 'Microsoft — Other';
  }
}

function deduplicate(items) {
  const result = new Map();

  for (const item of items) {
    const key = normaliseName(item.name);

    if (!key) {
      continue;
    }

    const existing = result.get(key);

    if (!existing) {
      result.set(key, item);
      continue;
    }

    result.set(key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(item).filter(([, value]) => value !== '' && value != null),
      ),
    });
  }

  return [...result.values()];
}

function walkJson(value, visitor, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return;
  }

  seen.add(value);
  visitor(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      walkJson(entry, visitor, seen);
    }
    return;
  }

  for (const entry of Object.values(value)) {
    walkJson(entry, visitor, seen);
  }
}

function extractMicrosoftFromJson(payload, sourceUrl) {
  const found = [];

  walkJson(payload, (object) => {
    const name = firstValue(object, [
      'certificationName',
      'credentialName',
      'displayName',
      'title',
      'name',
    ]);

    if (!isMicrosoftCertificationName(name)) {
      return;
    }

    found.push({
      name,
      issuer: 'Microsoft',
      issued: firstValue(object, [
        'achievementDate',
        'earnedDate',
        'issueDate',
        'issuedAt',
        'issued_at',
        'dateEarned',
      ]),
      expires: firstValue(object, [
        'expirationDate',
        'expiryDate',
        'expiresAt',
        'expires_at',
        'renewalDueDate',
      ]),
      status: firstValue(object, ['status', 'state']) || 'Active',
      imageUrl: firstValue(object, ['imageUrl', 'image_url', 'badgeImageUrl']),
      url: firstValue(object, ['publicUrl', 'public_url', 'url']) || sourceUrl,
      source: 'Microsoft Learn',
    });
  });

  return deduplicate(found);
}

function extractCredlyFromJson(payload) {
  const found = [];

  walkJson(payload, (object) => {
    const template = object.badge_template || object.badgeTemplate || object.template;
    const name =
      firstValue(template, ['name', 'title']) ||
      firstValue(object, ['badgeName', 'name', 'title']);

    if (!name || name.length > 180) {
      return;
    }

    const issuerObject =
      template?.issuer?.entities?.[0]?.entity ||
      template?.issuer ||
      object.issuer?.entities?.[0]?.entity ||
      object.issuer;

    const issuer =
      firstValue(issuerObject, ['name', 'display_name', 'displayName']) ||
      firstValue(object, ['issuerName', 'issuer_name']);

    if (!issuer && !isMicrosoftCertificationName(name) && !/(terraform|vault|consul|nomad)/i.test(name)) {
      return;
    }

    const id = firstValue(object, ['id', 'badge_id', 'badgeId']);

    found.push({
      name,
      issuer,
      issued: firstValue(object, [
        'issued_at',
        'issuedAt',
        'issue_date',
        'issueDate',
      ]),
      expires: firstValue(object, [
        'expires_at',
        'expiresAt',
        'expiration_date',
        'expirationDate',
      ]),
      status: firstValue(object, ['state', 'status']) || 'Active',
      imageUrl:
        firstValue(template, ['image_url', 'imageUrl']) ||
        firstValue(object, ['image_url', 'imageUrl']),
      url:
        firstValue(object, ['public_url', 'publicUrl', 'url']) ||
        (id ? `https://www.credly.com/badges/${id}` : CREDLY_URL),
      source: 'Credly',
    });
  });

  return deduplicate(found);
}

async function dismissCookies(page) {
  for (const label of [
    /accept all/i,
    /^accept$/i,
    /agree/i,
    /allow all/i,
    /continue without accepting/i,
  ]) {
    const button = page.getByRole('button', { name: label }).first();

    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      break;
    }
  }
}

async function scrollPage(page) {
  let previousHeight = 0;
  let stable = 0;

  for (let attempt = 0; attempt < 25 && stable < 3; attempt += 1) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(750);

    stable = height === previousHeight ? stable + 1 : 0;
    previousHeight = height;
  }
}

async function collectPage(page, url) {
  const jsonPayloads = [];
  const onResponse = async (response) => {
    const contentType = response.headers()['content-type'] || '';

    if (!contentType.includes('application/json')) {
      return;
    }

    try {
      jsonPayloads.push({ url: response.url(), data: await response.json() });
    } catch {
      // Some responses claim JSON but contain no usable body.
    }
  };

  page.on('response', onResponse);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await dismissCookies(page);
    await page.waitForTimeout(3_000);
    await scrollPage(page);
    await page.waitForTimeout(1_500);
  } finally {
    page.off('response', onResponse);
  }

  return jsonPayloads;
}

async function scrapeMicrosoft(page) {
  const payloads = await collectPage(page, MICROSOFT_URL);
  const fromJson = payloads.flatMap(({ data, url }) => extractMicrosoftFromJson(data, url));

  const fromDom = await page.evaluate(() => {
    const tidy = (value = '') => String(value).replace(/\s+/g, ' ').trim();
    const validName = (value) => {
      const product = /(azure|microsoft 365|windows server|security|identity|power platform|fabric|dynamics 365|devops|cybersecurity)/i;
      const level = /(expert|associate|specialty|fundamentals?|administrator|engineer|architect|developer)/i;
      return value.length <= 180 && product.test(value) && level.test(value);
    };

    const results = [];
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, a')];

    for (const heading of headings) {
      const name = tidy(heading.textContent || '');

      if (!validName(name)) {
        continue;
      }

      let container = heading;

      for (let depth = 0; depth < 6 && container.parentElement; depth += 1) {
        container = container.parentElement;
        const text = tidy(container.innerText || '');

        if (text.length >= name.length && text.length <= 1800 && /(earned|issued|expires?|renew|active|credential)/i.test(text)) {
          const image = container.querySelector('img');
          const link = container.querySelector('a[href]');
          results.push({
            name,
            text,
            imageUrl: image?.src || '',
            url: link?.href || location.href,
          });
          break;
        }
      }
    }

    return results;
  });

  const combined = [
    ...fromJson,
    ...fromDom.map((item) => ({
      name: item.name,
      issuer: 'Microsoft',
      issued: firstMatch(item.text, [
        /(?:earned|issued)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:expires?|expiration|renew|status|credential)|$)/i,
      ]),
      expires: firstMatch(item.text, [
        /(?:expires?|expiration date)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:renew|status|credential)|$)/i,
      ]),
      status: /expired|inactive/i.test(item.text) ? 'Expired' : 'Active',
      imageUrl: item.imageUrl,
      url: item.url || MICROSOFT_URL,
      source: 'Microsoft Learn',
    })),
  ];

  const certifications = deduplicate(combined).filter((item) => isMicrosoftCertificationName(item.name));

  if (certifications.length === 0) {
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'microsoft-learn.png'),
      fullPage: true,
    });
    await fs.writeFile(
      path.join(ARTIFACT_DIR, 'microsoft-learn.html'),
      await page.content(),
      'utf8',
    );
    throw new Error('No Microsoft certifications found. Debug HTML and screenshot were saved.');
  }

  return certifications;
}

async function scrapeCredly(page) {
  const payloads = await collectPage(page, CREDLY_URL);
  const fromJson = payloads.flatMap(({ data }) => extractCredlyFromJson(data));

  const badgeLinks = await page.locator('a[href*="/badges/"]').evaluateAll((anchors) => [
    ...new Set(
      anchors
        .map((anchor) => anchor.href)
        .filter((href) => /^https:\/\/www\.credly\.com\/badges\/[^/?#]+(?:\/public_url)?$/i.test(href))
        .map((href) => href.replace(/\/public_url$/, '')),
    ),
  ]);

  const fromDetails = [];

  for (const url of badgeLinks.slice(0, MAX_CREDLY_DETAIL_PAGES)) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await dismissCookies(page);
    await page.waitForTimeout(750);

    const detail = await page.evaluate(() => ({
      name: (document.querySelector('h1')?.textContent || '').trim(),
      body: document.body.innerText || '',
      imageUrl:
        document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('main img')?.src ||
        '',
    }));

    if (!detail.name) {
      continue;
    }

    fromDetails.push({
      name: clean(detail.name),
      issuer: firstMatch(detail.body, [/Issued by\s+([^\n]+)/i, /Issuer\s*:?\s*([^\n]+)/i]),
      issued: firstMatch(detail.body, [/Issued(?:\s+on)?\s*:?\s*([^\n]+)/i, /Issue date\s*:?\s*([^\n]+)/i]),
      expires: firstMatch(detail.body, [/Expires?(?:\s+on)?\s*:?\s*([^\n]+)/i, /Expiration date\s*:?\s*([^\n]+)/i]),
      status: /expired|revoked/i.test(detail.body) ? 'Expired' : 'Active',
      imageUrl: detail.imageUrl,
      url,
      source: 'Credly',
    });
  }

  const badges = deduplicate([...fromJson, ...fromDetails]).filter(
    (item) => isHashiCorpCredential(item) || isMicrosoftCredential(item),
  );

  if (badges.length === 0) {
    await page.goto(CREDLY_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'credly.png'), fullPage: true });
    await fs.writeFile(path.join(ARTIFACT_DIR, 'credly.html'), await page.content(), 'utf8');
    throw new Error('No relevant Credly badges found. Debug HTML and screenshot were saved.');
  }

  return badges;
}

function existingCertificates(data) {
  const result = new Map();

  for (const section of data.sections || []) {
    for (const cert of section.certs || []) {
      result.set(normaliseName(cert.name), cert);
    }
  }

  for (const cert of data.legacy || []) {
    result.set(normaliseName(cert.name), cert);
  }

  return result;
}

function displayCertificate(item, existing) {
  const output = {
    name: item.name,
    level: existing?.level || inferLevel(item.name),
    date: displayDate(item.issued) || existing?.date || '',
    status: item.status || 'Active',
    source: item.source,
    url: item.url,
  };

  if (item.expires) output.expires = displayDate(item.expires);
  if (existing?.image) output.image = existing.image;
  else if (item.imageUrl) output.image_url = item.imageUrl;

  return output;
}

function buildOutput(current, microsoft, credly) {
  const existing = existingCertificates(current);
  const microsoftKeys = new Set(microsoft.map((item) => normaliseName(item.name)));

  const activeMicrosoft = microsoft.filter((item) => !isExpired(item));
  const historicalMicrosoft = microsoft.filter(isExpired);

  const hashicorp = credly.filter(isHashiCorpCredential);
  const credlyMicrosoft = credly.filter(isMicrosoftCredential);

  for (const item of credlyMicrosoft) {
    if (!microsoftKeys.has(normaliseName(item.name))) {
      historicalMicrosoft.push(item);
    }
  }

  const groups = new Map();

  for (const item of activeMicrosoft) {
    const title = microsoftSection(item.name);
    const cert = displayCertificate(item, existing.get(normaliseName(item.name)));
    groups.set(title, [...(groups.get(title) || []), cert]);
  }

  const titleOrder = [
    'Microsoft Azure — Expert',
    'Microsoft Azure — Associate',
    'Microsoft Azure — Specialty',
    'Microsoft — Fundamentals',
    'Microsoft — Other',
  ];

  const sections = titleOrder
    .filter((title) => groups.has(title))
    .map((title) => ({
      title,
      certs: groups.get(title).sort((a, b) => a.name.localeCompare(b.name)),
    }));

  const activeHashiCorp = hashicorp
    .filter((item) => !isExpired(item))
    .map((item) => displayCertificate(item, existing.get(normaliseName(item.name))))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (activeHashiCorp.length) {
    sections.push({ title: 'HashiCorp', certs: activeHashiCorp });
  }

  const preservedSections = (current.sections || []).filter(
    (section) => !/^Microsoft/i.test(section.title || '') && !/^HashiCorp$/i.test(section.title || ''),
  );
  sections.push(...preservedSections);

  const manualLegacy = (current.legacy || []).filter(
    (item) => !['Credly', 'Microsoft Learn'].includes(item.source),
  );
  const usedLegacy = new Set(manualLegacy.map((item) => normaliseName(item.name)));

  const generatedLegacy = deduplicate([
    ...historicalMicrosoft,
    ...hashicorp.filter(isExpired),
  ])
    .filter((item) => {
      const itemKey = normaliseName(item.name);
      if (usedLegacy.has(itemKey)) return false;
      usedLegacy.add(itemKey);
      return true;
    })
    .map((item) => ({
      name: item.name,
      date: displayDate(item.issued),
      status: item.status || 'Historical',
      source: item.source,
      url: item.url,
    }));

  return { sections, legacy: [...manualLegacy, ...generatedLegacy] };
}

function comparable(data) {
  const copy = structuredClone(data || {});
  delete copy.last_synced;
  return JSON.stringify(copy);
}

function runSelfTest() {
  const microsoftJson = {
    credentials: [
      {
        certificationName: 'Microsoft Certified: Azure Solutions Architect Expert',
        achievementDate: '2025-01-10',
        expirationDate: '2027-01-10',
        status: 'Active',
      },
    ],
  };

  const credlyJson = {
    data: [
      {
        id: 'abc',
        issued_at: '2025-02-01',
        state: 'accepted',
        badge_template: {
          name: 'HashiCorp Certified: Terraform Associate (003)',
          image_url: 'https://example.test/terraform.png',
          issuer: { entities: [{ entity: { name: 'HashiCorp' } }] },
        },
      },
    ],
  };

  const microsoft = extractMicrosoftFromJson(microsoftJson, MICROSOFT_URL);
  const credly = extractCredlyFromJson(credlyJson);

  if (microsoft.length !== 1 || microsoft[0].name !== 'Microsoft Certified: Azure Solutions Architect Expert') {
    throw new Error('Microsoft JSON extraction self-test failed.');
  }

  if (credly.length !== 1 || !isHashiCorpCredential(credly[0])) {
    throw new Error('Credly JSON extraction self-test failed.');
  }

  const output = buildOutput({ sections: [], legacy: [] }, microsoft, credly);

  if (output.sections.length !== 2) {
    throw new Error('Output merge self-test failed.');
  }

  console.log('Self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const [{ chromium }, yaml] = await Promise.all([
    import('playwright'),
    Promise.resolve(require('js-yaml')),
  ]);

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  const currentText = await fs.readFile(DATA_FILE, 'utf8');
  const current = yaml.load(currentText) || {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-GB',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 Chrome/131 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    const microsoft = await scrapeMicrosoft(page);
    const credly = await scrapeCredly(page);
    const generated = buildOutput(current, microsoft, credly);

    console.log(`Microsoft Learn certifications: ${microsoft.length}`);
    console.log(`Relevant Credly badges: ${credly.length}`);

    if (comparable(current) === comparable(generated)) {
      console.log('No certification changes detected.');
      return;
    }

    const output = {
      last_synced: new Date().toISOString(),
      ...generated,
    };

    await fs.writeFile(
      DATA_FILE,
      yaml.dump(output, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      }),
      'utf8',
    );

    console.log(`Updated ${DATA_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
