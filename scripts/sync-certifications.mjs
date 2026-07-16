import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { load, dump } from 'js-yaml';

const MICROSOFT_URL =
  'https://learn.microsoft.com/en-gb/users/rawritscloud/transcript/71rywhwqmgnym3r?tab=credentials-tab';

const CREDLY_URL =
  'https://www.credly.com/users/james.murray-ferris/badges/credly';

const DATA_FILE = path.resolve('_data/certifications.yml');
const ARTIFACT_DIR = path.resolve('artifacts/cert-sync');

const clean = (value = '') =>
  value.replace(/\s+/g, ' ').trim();

const key = (value = '') =>
  clean(value)
    .toLowerCase()
    .replace(/^microsoft certified:\s*/i, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const match = text.match(expression);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return '';
}

function shortDate(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return clean(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function inferLevel(name) {
  if (/expert/i.test(name)) return 'Expert';
  if (/associate/i.test(name)) return 'Associate';
  if (/specialty/i.test(name)) return 'Specialty';
  if (/fundamental/i.test(name)) return 'Fundamental';
  if (/professional/i.test(name)) return 'Professional';

  return 'Certification';
}

function microsoftSectionTitle(name) {
  const level = inferLevel(name);

  if (level === 'Expert') {
    return 'Microsoft Azure — Expert';
  }

  if (level === 'Associate') {
    return 'Microsoft Azure — Associate';
  }

  if (level === 'Specialty') {
    return 'Microsoft Azure — Specialty';
  }

  if (level === 'Fundamental') {
    return 'Microsoft — Fundamentals';
  }

  return 'Microsoft — Other';
}

function isExpired(item) {
  if (/expired|inactive|retired/i.test(item.status || '')) {
    return true;
  }

  if (!item.expires) {
    return false;
  }

  const expirationDate = new Date(item.expires);

  return (
    !Number.isNaN(expirationDate.valueOf()) &&
    expirationDate < new Date()
  );
}

async function dismissCookies(page) {
  const buttonNames = [
    /accept all/i,
    /accept/i,
    /agree/i,
    /allow all/i,
    /continue without accepting/i,
  ];

  for (const name of buttonNames) {
    const button = page
      .getByRole('button', { name })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}

async function scrollToEnd(page) {
  let previousHeight = 0;
  let unchangedCount = 0;

  for (
    let attempt = 0;
    attempt < 30 && unchangedCount < 3;
    attempt += 1
  ) {
    const currentHeight = await page.evaluate(
      () => document.body.scrollHeight,
    );

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(900);

    if (currentHeight === previousHeight) {
      unchangedCount += 1;
    } else {
      unchangedCount = 0;
    }

    previousHeight = currentHeight;
  }
}

async function scrapeMicrosoft(page) {
  await page.goto(MICROSOFT_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  await dismissCookies(page);

  const credentialsTab = page
    .getByRole('tab', { name: /credentials/i })
    .first();

  if (await credentialsTab.isVisible().catch(() => false)) {
    await credentialsTab.click().catch(() => {});
  } else {
    const credentialsButton = page
      .getByRole('button', { name: /credentials/i })
      .first();

    if (
      await credentialsButton
        .isVisible()
        .catch(() => false)
    ) {
      await credentialsButton.click().catch(() => {});
    }
  }

  await page.waitForTimeout(4_000);
  await scrollToEnd(page);

  const records = await page.evaluate(() => {
    const tidy = (value = '') =>
      value.replace(/\s+/g, ' ').trim();

    const certificationWords =
      /(Microsoft Certified|Azure|Windows Server|Microsoft 365|Security|Identity|Power Platform|Fabric|Dynamics 365|DevOps)/i;

    const detailWords =
      /(earned|issued|expires?|expiration|renew|active|credential|certification number)/i;

    const elements = Array.from(
      document.querySelectorAll(
        [
          'article',
          'li',
          '[class*="card"]',
          '[class*="credential"]',
          '[class*="certification"]',
        ].join(','),
      ),
    );

    const candidates = elements.filter((element) => {
      const text = tidy(element.innerText || '');

      return (
        text.length >= 20 &&
        text.length <= 1500 &&
        certificationWords.test(text) &&
        detailWords.test(text)
      );
    });

    const leafCandidates = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) =>
            other !== candidate &&
            candidate.contains(other),
        ),
    );

    const source =
      leafCandidates.length > 0
        ? leafCandidates
        : candidates;

    return source
      .map((element) => {
        const originalText = element.innerText || '';
        const text = tidy(originalText);

        const lines = originalText
          .split('\n')
          .map(tidy)
          .filter(Boolean);

        const heading = element.querySelector(
          'h1, h2, h3, h4, h5',
        );

        const certificationLink = Array.from(
          element.querySelectorAll('a'),
        ).find((anchor) =>
          /\/credentials\/certifications\//i.test(
            anchor.href,
          ),
        );

        const name =
          tidy(
            heading?.textContent ||
              certificationLink?.textContent ||
              '',
          ) ||
          lines.find(
            (line) =>
              certificationWords.test(line) &&
              line.length < 180,
          ) ||
          '';

        const image = element.querySelector('img');

        const link =
          certificationLink ||
          element.querySelector('a[href]');

        return {
          name,
          text,
          imageUrl: image?.src || '',
          url: link?.href || '',
        };
      })
      .filter(
        (item) =>
          item.name &&
          certificationWords.test(item.name),
      );
  });

  const certifications = records.map((record) => ({
    name: clean(record.name),

    issued: firstMatch(record.text, [
      /(?:earned|issued)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:expires?|expiration|renew|status|credential)|$)/i,
    ]),

    expires: firstMatch(record.text, [
      /(?:expires?|expiration date)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:renew|status|credential)|$)/i,
    ]),

    status: /expired/i.test(record.text)
      ? 'Expired'
      : 'Active',

    imageUrl: record.imageUrl,
    url: record.url || MICROSOFT_URL,
    source: 'Microsoft Learn',
  }));

  const unique = [
    ...new Map(
      certifications.map((item) => [
        key(item.name),
        item,
      ]),
    ).values(),
  ];

  if (unique.length === 0) {
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        'microsoft-learn.png',
      ),
      fullPage: true,
    });

    throw new Error(
      'No Microsoft certifications were found. The Microsoft Learn page layout may have changed.',
    );
  }

  return unique;
}

async function scrapeCredly(page) {
  await page.goto(CREDLY_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  await dismissCookies(page);
  await page.waitForTimeout(4_000);
  await scrollToEnd(page);

  const links = await page
    .locator('a[href]')
    .evaluateAll((anchors) => [
      ...new Set(
        anchors
          .map((anchor) => anchor.href)
          .filter((href) =>
            /^https:\/\/www\.credly\.com\/badges\/[^/?#]+(?:\/public_url)?$/i.test(
              href,
            ),
          )
          .map((href) =>
            href.replace(/\/public_url$/, ''),
          ),
      ),
    ]);

  if (links.length === 0) {
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        'credly.png',
      ),
      fullPage: true,
    });

    throw new Error(
      'No Credly badge links were found. The Credly page layout may have changed.',
    );
  }

  const badges = [];

  for (const url of links) {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });

    await dismissCookies(page);
    await page.waitForTimeout(1_000);

    const detail = await page.evaluate(() => {
      const tidy = (value = '') =>
        value.replace(/\s+/g, ' ').trim();

      return {
        name: tidy(
          document.querySelector('h1')
            ?.textContent || '',
        ),

        body: document.body.innerText || '',

        imageUrl:
          document.querySelector(
            'meta[property="og:image"]',
          )?.content ||
          document.querySelector('main img')?.src ||
          '',
      };
    });

    if (!detail.name) {
      continue;
    }

    badges.push({
      name: detail.name,

      issuer: firstMatch(detail.body, [
        /Issued by\s+([^\n]+)/i,
        /Issuer\s*:?\s*([^\n]+)/i,
      ]),

      issued: firstMatch(detail.body, [
        /Issued(?:\s+on)?\s*:?\s*([^\n]+)/i,
        /Issue date\s*:?\s*([^\n]+)/i,
      ]),

      expires: firstMatch(detail.body, [
        /Expires?(?:\s+on)?\s*:?\s*([^\n]+)/i,
        /Expiration date\s*:?\s*([^\n]+)/i,
      ]),

      status: /expired/i.test(detail.body)
        ? 'Expired'
        : 'Active',

      imageUrl: detail.imageUrl,
      url,
      source: 'Credly',
    });
  }

  return [
    ...new Map(
      badges.map((item) => [
        key(item.name),
        item,
      ]),
    ).values(),
  ];
}

function existingCertificateMap(data) {
  const map = new Map();

  for (const section of data.sections || []) {
    for (const certificate of section.certs || []) {
      map.set(
        key(certificate.name),
        certificate,
      );
    }
  }

  for (const certificate of data.legacy || []) {
    map.set(
      key(certificate.name),
      certificate,
    );
  }

  return map;
}

function toDisplayCertificate(item, existing) {
  const certificate = {
    name: item.name,
    level:
      existing?.level ||
      inferLevel(item.name),
    date:
      shortDate(item.issued) ||
      existing?.date ||
      '',
    status: item.status || 'Active',
    source: item.source,
    url: item.url,
  };

  if (item.expires) {
    certificate.expires = shortDate(
      item.expires,
    );
  }

  if (existing?.image) {
    certificate.image = existing.image;
  } else if (item.imageUrl) {
    certificate.image_url = item.imageUrl;
  }

  return certificate;
}

function buildData(current, microsoft, credly) {
  const existingMap =
    existingCertificateMap(current);

  const microsoftKeys = new Set(
    microsoft.map((item) => key(item.name)),
  );

  const activeMicrosoft = microsoft.filter(
    (item) => !isExpired(item),
  );

  const historicalMicrosoft = microsoft.filter(
    isExpired,
  );

  const hashicorp = credly.filter(
    (item) =>
      /hashicorp/i.test(item.issuer) ||
      /terraform/i.test(item.name),
  );

  const credlyMicrosoft = credly.filter(
    (item) =>
      /microsoft/i.test(item.issuer) ||
      /^microsoft certified:/i.test(item.name),
  );

  for (const item of credlyMicrosoft) {
    if (!microsoftKeys.has(key(item.name))) {
      historicalMicrosoft.push(item);
    }
  }

  const groupedMicrosoft = new Map();

  for (const item of activeMicrosoft) {
    const title =
      microsoftSectionTitle(item.name);

    if (!groupedMicrosoft.has(title)) {
      groupedMicrosoft.set(title, []);
    }

    groupedMicrosoft.get(title).push(
      toDisplayCertificate(
        item,
        existingMap.get(key(item.name)),
      ),
    );
  }

  const orderedMicrosoftTitles = [
    'Microsoft Azure — Expert',
    'Microsoft Azure — Associate',
    'Microsoft Azure — Specialty',
    'Microsoft — Fundamentals',
    'Microsoft — Other',
  ];

  const preservedSections = (
    current.sections || []
  ).filter(
    (section) =>
      !/^Microsoft/i.test(section.title || '') &&
      !/^HashiCorp$/i.test(section.title || ''),
  );

  const sections = orderedMicrosoftTitles
    .filter(
      (title) =>
        groupedMicrosoft.get(title)?.length,
    )
    .map((title) => ({
      title,

      certs: groupedMicrosoft
        .get(title)
        .sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
    }));

  const activeHashicorp = hashicorp
    .filter((item) => !isExpired(item))
    .map((item) =>
      toDisplayCertificate(
        item,
        existingMap.get(key(item.name)),
      ),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name),
    );

  if (activeHashicorp.length > 0) {
    sections.push({
      title: 'HashiCorp',
      certs: activeHashicorp,
    });
  }

  sections.push(...preservedSections);

  const manualLegacy = (
    current.legacy || []
  ).filter(
    (item) =>
      item.source !== 'Credly' &&
      item.source !== 'Microsoft Learn',
  );

  const legacyKeys = new Set(
    manualLegacy.map((item) =>
      key(item.name),
    ),
  );

  const generatedLegacy = [
    ...historicalMicrosoft,
    ...hashicorp.filter(isExpired),
  ]
    .filter((item) => {
      const itemKey = key(item.name);

      if (legacyKeys.has(itemKey)) {
        return false;
      }

      legacyKeys.add(itemKey);
      return true;
    })
    .map((item) => ({
      name: item.name,
      date: shortDate(item.issued),
      status:
        item.status || 'Historical',
      source: item.source,
      url: item.url,
    }));

  return {
    sections,
    legacy: [
      ...manualLegacy,
      ...generatedLegacy,
    ],
  };
}

function withoutSyncTimestamp(data) {
  const copy = structuredClone(data);

  delete copy.last_synced;

  return copy;
}

await fs.mkdir(ARTIFACT_DIR, {
  recursive: true,
});

const currentText = await fs.readFile(
  DATA_FILE,
  'utf8',
);

const current = load(currentText) || {};

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  locale: 'en-GB',

  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 Chrome/131 Safari/537.36',
});

const page = await context.newPage();

try {
  const microsoft =
    await scrapeMicrosoft(page);

  const credly =
    await scrapeCredly(page);

  const generated = buildData(
    current,
    microsoft,
    credly,
  );

  const currentComparable =
    JSON.stringify(
      withoutSyncTimestamp(current),
    );

  const generatedComparable =
    JSON.stringify(generated);

  console.log(
    `Microsoft Learn certifications: ${microsoft.length}`,
  );

  console.log(
    `Credly badges inspected: ${credly.length}`,
  );

  if (
    currentComparable ===
    generatedComparable
  ) {
    console.log(
      'No certification changes detected.',
    );

    process.exitCode = 0;
  } else {
    const output = {
      last_synced:
        new Date().toISOString(),
      ...generated,
    };

    await fs.writeFile(
      DATA_FILE,

      dump(output, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      }),

      'utf8',
    );

    console.log(`Updated ${DATA_FILE}`);
  }
} finally {
  await browser.close();
}import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { load, dump } from 'js-yaml';

const MICROSOFT_URL =
  'https://learn.microsoft.com/en-gb/users/rawritscloud/transcript/71rywhwqmgnym3r?tab=credentials-tab';

const CREDLY_URL =
  'https://www.credly.com/users/james.murray-ferris/badges/credly';

const DATA_FILE = path.resolve('_data/certifications.yml');
const ARTIFACT_DIR = path.resolve('artifacts/cert-sync');

const clean = (value = '') =>
  value.replace(/\s+/g, ' ').trim();

const key = (value = '') =>
  clean(value)
    .toLowerCase()
    .replace(/^microsoft certified:\s*/i, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const match = text.match(expression);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return '';
}

function shortDate(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return clean(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function inferLevel(name) {
  if (/expert/i.test(name)) return 'Expert';
  if (/associate/i.test(name)) return 'Associate';
  if (/specialty/i.test(name)) return 'Specialty';
  if (/fundamental/i.test(name)) return 'Fundamental';
  if (/professional/i.test(name)) return 'Professional';

  return 'Certification';
}

function microsoftSectionTitle(name) {
  const level = inferLevel(name);

  if (level === 'Expert') {
    return 'Microsoft Azure — Expert';
  }

  if (level === 'Associate') {
    return 'Microsoft Azure — Associate';
  }

  if (level === 'Specialty') {
    return 'Microsoft Azure — Specialty';
  }

  if (level === 'Fundamental') {
    return 'Microsoft — Fundamentals';
  }

  return 'Microsoft — Other';
}

function isExpired(item) {
  if (/expired|inactive|retired/i.test(item.status || '')) {
    return true;
  }

  if (!item.expires) {
    return false;
  }

  const expirationDate = new Date(item.expires);

  return (
    !Number.isNaN(expirationDate.valueOf()) &&
    expirationDate < new Date()
  );
}

async function dismissCookies(page) {
  const buttonNames = [
    /accept all/i,
    /accept/i,
    /agree/i,
    /allow all/i,
    /continue without accepting/i,
  ];

  for (const name of buttonNames) {
    const button = page
      .getByRole('button', { name })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}

async function scrollToEnd(page) {
  let previousHeight = 0;
  let unchangedCount = 0;

  for (
    let attempt = 0;
    attempt < 30 && unchangedCount < 3;
    attempt += 1
  ) {
    const currentHeight = await page.evaluate(
      () => document.body.scrollHeight,
    );

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(900);

    if (currentHeight === previousHeight) {
      unchangedCount += 1;
    } else {
      unchangedCount = 0;
    }

    previousHeight = currentHeight;
  }
}

async function scrapeMicrosoft(page) {
  await page.goto(MICROSOFT_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  await dismissCookies(page);

  const credentialsTab = page
    .getByRole('tab', { name: /credentials/i })
    .first();

  if (await credentialsTab.isVisible().catch(() => false)) {
    await credentialsTab.click().catch(() => {});
  } else {
    const credentialsButton = page
      .getByRole('button', { name: /credentials/i })
      .first();

    if (
      await credentialsButton
        .isVisible()
        .catch(() => false)
    ) {
      await credentialsButton.click().catch(() => {});
    }
  }

  await page.waitForTimeout(4_000);
  await scrollToEnd(page);

  const records = await page.evaluate(() => {
    const tidy = (value = '') =>
      value.replace(/\s+/g, ' ').trim();

    const certificationWords =
      /(Microsoft Certified|Azure|Windows Server|Microsoft 365|Security|Identity|Power Platform|Fabric|Dynamics 365|DevOps)/i;

    const detailWords =
      /(earned|issued|expires?|expiration|renew|active|credential|certification number)/i;

    const elements = Array.from(
      document.querySelectorAll(
        [
          'article',
          'li',
          '[class*="card"]',
          '[class*="credential"]',
          '[class*="certification"]',
        ].join(','),
      ),
    );

    const candidates = elements.filter((element) => {
      const text = tidy(element.innerText || '');

      return (
        text.length >= 20 &&
        text.length <= 1500 &&
        certificationWords.test(text) &&
        detailWords.test(text)
      );
    });

    const leafCandidates = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) =>
            other !== candidate &&
            candidate.contains(other),
        ),
    );

    const source =
      leafCandidates.length > 0
        ? leafCandidates
        : candidates;

    return source
      .map((element) => {
        const originalText = element.innerText || '';
        const text = tidy(originalText);

        const lines = originalText
          .split('\n')
          .map(tidy)
          .filter(Boolean);

        const heading = element.querySelector(
          'h1, h2, h3, h4, h5',
        );

        const certificationLink = Array.from(
          element.querySelectorAll('a'),
        ).find((anchor) =>
          /\/credentials\/certifications\//i.test(
            anchor.href,
          ),
        );

        const name =
          tidy(
            heading?.textContent ||
              certificationLink?.textContent ||
              '',
          ) ||
          lines.find(
            (line) =>
              certificationWords.test(line) &&
              line.length < 180,
          ) ||
          '';

        const image = element.querySelector('img');

        const link =
          certificationLink ||
          element.querySelector('a[href]');

        return {
          name,
          text,
          imageUrl: image?.src || '',
          url: link?.href || '',
        };
      })
      .filter(
        (item) =>
          item.name &&
          certificationWords.test(item.name),
      );
  });

  const certifications = records.map((record) => ({
    name: clean(record.name),

    issued: firstMatch(record.text, [
      /(?:earned|issued)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:expires?|expiration|renew|status|credential)|$)/i,
    ]),

    expires: firstMatch(record.text, [
      /(?:expires?|expiration date)(?:\s+on)?\s*:?\s*([^|•]+?)(?=\s+(?:renew|status|credential)|$)/i,
    ]),

    status: /expired/i.test(record.text)
      ? 'Expired'
      : 'Active',

    imageUrl: record.imageUrl,
    url: record.url || MICROSOFT_URL,
    source: 'Microsoft Learn',
  }));

  const unique = [
    ...new Map(
      certifications.map((item) => [
        key(item.name),
        item,
      ]),
    ).values(),
  ];

  if (unique.length === 0) {
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        'microsoft-learn.png',
      ),
      fullPage: true,
    });

    throw new Error(
      'No Microsoft certifications were found. The Microsoft Learn page layout may have changed.',
    );
  }

  return unique;
}

async function scrapeCredly(page) {
  await page.goto(CREDLY_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });

  await dismissCookies(page);
  await page.waitForTimeout(4_000);
  await scrollToEnd(page);

  const links = await page
    .locator('a[href]')
    .evaluateAll((anchors) => [
      ...new Set(
        anchors
          .map((anchor) => anchor.href)
          .filter((href) =>
            /^https:\/\/www\.credly\.com\/badges\/[^/?#]+(?:\/public_url)?$/i.test(
              href,
            ),
          )
          .map((href) =>
            href.replace(/\/public_url$/, ''),
          ),
      ),
    ]);

  if (links.length === 0) {
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        'credly.png',
      ),
      fullPage: true,
    });

    throw new Error(
      'No Credly badge links were found. The Credly page layout may have changed.',
    );
  }

  const badges = [];

  for (const url of links) {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });

    await dismissCookies(page);
    await page.waitForTimeout(1_000);

    const detail = await page.evaluate(() => {
      const tidy = (value = '') =>
        value.replace(/\s+/g, ' ').trim();

      return {
        name: tidy(
          document.querySelector('h1')
            ?.textContent || '',
        ),

        body: document.body.innerText || '',

        imageUrl:
          document.querySelector(
            'meta[property="og:image"]',
          )?.content ||
          document.querySelector('main img')?.src ||
          '',
      };
    });

    if (!detail.name) {
      continue;
    }

    badges.push({
      name: detail.name,

      issuer: firstMatch(detail.body, [
        /Issued by\s+([^\n]+)/i,
        /Issuer\s*:?\s*([^\n]+)/i,
      ]),

      issued: firstMatch(detail.body, [
        /Issued(?:\s+on)?\s*:?\s*([^\n]+)/i,
        /Issue date\s*:?\s*([^\n]+)/i,
      ]),

      expires: firstMatch(detail.body, [
        /Expires?(?:\s+on)?\s*:?\s*([^\n]+)/i,
        /Expiration date\s*:?\s*([^\n]+)/i,
      ]),

      status: /expired/i.test(detail.body)
        ? 'Expired'
        : 'Active',

      imageUrl: detail.imageUrl,
      url,
      source: 'Credly',
    });
  }

  return [
    ...new Map(
      badges.map((item) => [
        key(item.name),
        item,
      ]),
    ).values(),
  ];
}

function existingCertificateMap(data) {
  const map = new Map();

  for (const section of data.sections || []) {
    for (const certificate of section.certs || []) {
      map.set(
        key(certificate.name),
        certificate,
      );
    }
  }

  for (const certificate of data.legacy || []) {
    map.set(
      key(certificate.name),
      certificate,
    );
  }

  return map;
}

function toDisplayCertificate(item, existing) {
  const certificate = {
    name: item.name,
    level:
      existing?.level ||
      inferLevel(item.name),
    date:
      shortDate(item.issued) ||
      existing?.date ||
      '',
    status: item.status || 'Active',
    source: item.source,
    url: item.url,
  };

  if (item.expires) {
    certificate.expires = shortDate(
      item.expires,
    );
  }

  if (existing?.image) {
    certificate.image = existing.image;
  } else if (item.imageUrl) {
    certificate.image_url = item.imageUrl;
  }

  return certificate;
}

function buildData(current, microsoft, credly) {
  const existingMap =
    existingCertificateMap(current);

  const microsoftKeys = new Set(
    microsoft.map((item) => key(item.name)),
  );

  const activeMicrosoft = microsoft.filter(
    (item) => !isExpired(item),
  );

  const historicalMicrosoft = microsoft.filter(
    isExpired,
  );

  const hashicorp = credly.filter(
    (item) =>
      /hashicorp/i.test(item.issuer) ||
      /terraform/i.test(item.name),
  );

  const credlyMicrosoft = credly.filter(
    (item) =>
      /microsoft/i.test(item.issuer) ||
      /^microsoft certified:/i.test(item.name),
  );

  for (const item of credlyMicrosoft) {
    if (!microsoftKeys.has(key(item.name))) {
      historicalMicrosoft.push(item);
    }
  }

  const groupedMicrosoft = new Map();

  for (const item of activeMicrosoft) {
    const title =
      microsoftSectionTitle(item.name);

    if (!groupedMicrosoft.has(title)) {
      groupedMicrosoft.set(title, []);
    }

    groupedMicrosoft.get(title).push(
      toDisplayCertificate(
        item,
        existingMap.get(key(item.name)),
      ),
    );
  }

  const orderedMicrosoftTitles = [
    'Microsoft Azure — Expert',
    'Microsoft Azure — Associate',
    'Microsoft Azure — Specialty',
    'Microsoft — Fundamentals',
    'Microsoft — Other',
  ];

  const preservedSections = (
    current.sections || []
  ).filter(
    (section) =>
      !/^Microsoft/i.test(section.title || '') &&
      !/^HashiCorp$/i.test(section.title || ''),
  );

  const sections = orderedMicrosoftTitles
    .filter(
      (title) =>
        groupedMicrosoft.get(title)?.length,
    )
    .map((title) => ({
      title,

      certs: groupedMicrosoft
        .get(title)
        .sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
    }));

  const activeHashicorp = hashicorp
    .filter((item) => !isExpired(item))
    .map((item) =>
      toDisplayCertificate(
        item,
        existingMap.get(key(item.name)),
      ),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name),
    );

  if (activeHashicorp.length > 0) {
    sections.push({
      title: 'HashiCorp',
      certs: activeHashicorp,
    });
  }

  sections.push(...preservedSections);

  const manualLegacy = (
    current.legacy || []
  ).filter(
    (item) =>
      item.source !== 'Credly' &&
      item.source !== 'Microsoft Learn',
  );

  const legacyKeys = new Set(
    manualLegacy.map((item) =>
      key(item.name),
    ),
  );

  const generatedLegacy = [
    ...historicalMicrosoft,
    ...hashicorp.filter(isExpired),
  ]
    .filter((item) => {
      const itemKey = key(item.name);

      if (legacyKeys.has(itemKey)) {
        return false;
      }

      legacyKeys.add(itemKey);
      return true;
    })
    .map((item) => ({
      name: item.name,
      date: shortDate(item.issued),
      status:
        item.status || 'Historical',
      source: item.source,
      url: item.url,
    }));

  return {
    sections,
    legacy: [
      ...manualLegacy,
      ...generatedLegacy,
    ],
  };
}

function withoutSyncTimestamp(data) {
  const copy = structuredClone(data);

  delete copy.last_synced;

  return copy;
}

await fs.mkdir(ARTIFACT_DIR, {
  recursive: true,
});

const currentText = await fs.readFile(
  DATA_FILE,
  'utf8',
);

const current = load(currentText) || {};

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  locale: 'en-GB',

  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 Chrome/131 Safari/537.36',
});

const page = await context.newPage();

try {
  const microsoft =
    await scrapeMicrosoft(page);

  const credly =
    await scrapeCredly(page);

  const generated = buildData(
    current,
    microsoft,
    credly,
  );

  const currentComparable =
    JSON.stringify(
      withoutSyncTimestamp(current),
    );

  const generatedComparable =
    JSON.stringify(generated);

  console.log(
    `Microsoft Learn certifications: ${microsoft.length}`,
  );

  console.log(
    `Credly badges inspected: ${credly.length}`,
  );

  if (
    currentComparable ===
    generatedComparable
  ) {
    console.log(
      'No certification changes detected.',
    );

    process.exitCode = 0;
  } else {
    const output = {
      last_synced:
        new Date().toISOString(),
      ...generated,
    };

    await fs.writeFile(
      DATA_FILE,

      dump(output, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      }),

      'utf8',
    );

    console.log(`Updated ${DATA_FILE}`);
  }
} finally {
  await browser.close();
}
