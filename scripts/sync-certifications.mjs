import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MICROSOFT_URL =
  'https://learn.microsoft.com/en-gb/users/rawritscloud/transcript/71rywhwqmgnym3r?tab=credentials-tab';

const CREDLY_URL =
  'https://www.credly.com/users/james.murray-ferris/badges/credly';

const DATA_FILE = path.resolve('_data/certifications.yml');
const IMAGE_DIR = path.resolve('assets/images/certs');
const ARTIFACT_DIR = path.resolve('artifacts/cert-sync');
const MAX_CREDLY_DETAIL_PAGES = 100;

const EXCLUDED_BADGE_PATTERNS = [
  /^Exam Contributor:/i,
  /^Alpha Tester:/i,
  /^\s*-?\s*(?:Pass\s+)?Exam\b/i,
];

const MICROSOFT_SECTION_PREFIX = /^Microsoft\b/i;
const HASHICORP_SECTION = 'HashiCorp';

const clean = (value = '') => String(value).replace(/\s+/g, ' ').trim();

function displayName(value = '') {
  return clean(value)
    .replace(/^microsoft certified:\s*/i, '')
    .replace(/^microsoft\s+/i, '')
    .replace(/^hashicorp certified:\s*/i, '')
    .replace(/\s*\(\d{3}\)\s*$/i, '')
    .trim();
}

function normaliseName(value = '') {
  return displayName(value)
    .replace(/[®™]/g, '')
    .replace(/&/g, 'and')
    .replace(/\bcertified\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === 'string' && clean(value)) return clean(value);
  }
  return '';
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function displayDate(value) {
  if (!value) return '';
  const parsed = parseDate(value);
  if (!parsed) return clean(value);

  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function isExpired(item) {
  if (/expired|inactive|retired|revoked/i.test(item?.status || '')) return true;
  const expires = parseDate(item?.expires);
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

function isExcludedBadge(item) {
  const name = typeof item === 'string' ? item : item?.name || '';
  return EXCLUDED_BADGE_PATTERNS.some((pattern) => pattern.test(clean(name)));
}

function isMicrosoftCertificationName(name) {
  const value = clean(name);
  if (!value || value.length > 180 || isExcludedBadge(value)) return false;

  const product =
    /(azure|microsoft 365|windows server|security|identity|power platform|fabric|dynamics 365|devops|cybersecurity)/i;
  const level =
    /(expert|associate|specialty|fundamentals?|administrator|engineer|architect|developer|analyst)/i;

  return product.test(value) && level.test(value);
}

function isMicrosoftCredential(item) {
  return (
    /microsoft/i.test(item?.issuer || '') ||
    isMicrosoftCertificationName(item?.name || '')
  );
}

function isHashiCorpCredential(item) {
  if (isExcludedBadge(item) || isMicrosoftCredential(item)) return false;

  return (
    /hashicorp/i.test(item?.issuer || '') ||
    /(terraform|vault|consul|nomad)\b/i.test(item?.name || '')
  );
}

function targetSection(item) {
  if (isHashiCorpCredential(item)) return HASHICORP_SECTION;

  switch (inferLevel(item.name)) {
    case 'Expert':
      return 'Microsoft Azure — Expert';
    case 'Associate':
      return 'Microsoft Azure — Associate';
    case 'Specialty':
      return 'Microsoft Azure — Specialty';
    case 'Fundamental':
      return 'Microsoft — Fundamentals';
    default:
      return null;
  }
}

function sectionSource(section) {
  if (section?.title === HASHICORP_SECTION) return 'credly';
  if (MICROSOFT_SECTION_PREFIX.test(section?.title || '')) return 'microsoft';
  return 'manual';
}

function deduplicate(items) {
  const result = new Map();

  for (const item of items) {
    const key = normaliseName(item?.name);
    if (!key) continue;

    const existing = result.get(key) || {};
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
  if (!value || typeof value !== 'object' || seen.has(value)) return;

  seen.add(value);
  visitor(value);

  if (Array.isArray(value)) {
    for (const entry of value) walkJson(entry, visitor, seen);
    return;
  }

  for (const entry of Object.values(value)) walkJson(entry, visitor, seen);
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

    if (!isMicrosoftCertificationName(name)) return;

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
      imageUrl: firstValue(object, [
        'imageUrl',
        'image_url',
        'badgeImageUrl',
      ]),
      url:
        firstValue(object, ['publicUrl', 'public_url', 'url']) ||
        sourceUrl ||
        MICROSOFT_URL,
      source: 'Microsoft Learn',
    });
  });

  return deduplicate(found);
}

function extractCredlyFromJson(payload) {
  const found = [];

  walkJson(payload, (object) => {
    const template =
      object.badge_template ||
      object.badgeTemplate ||
      object.template;

    const name =
      firstValue(template, ['name', 'title']) ||
      firstValue(object, ['badgeName', 'name', 'title']);

    if (!name || name.length > 180 || isExcludedBadge(name)) return;

    const issuerObject =
      template?.issuer?.entities?.[0]?.entity ||
      template?.issuer ||
      object.issuer?.entities?.[0]?.entity ||
      object.issuer;

    const issuer =
      firstValue(issuerObject, ['name', 'display_name', 'displayName']) ||
      firstValue(object, ['issuerName', 'issuer_name']);

    const candidate = { name, issuer };

    // Credly is deliberately used only for non-Microsoft credentials.
    // At present the site has a HashiCorp section, so ignore everything else.
    if (!isHashiCorpCredential(candidate)) return;

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
    if (!contentType.includes('application/json')) return;

    try {
      jsonPayloads.push({
        url: response.url(),
        data: await response.json(),
      });
    } catch {
      // Ignore empty or malformed JSON responses.
    }
  };

  page.on('response', onResponse);

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await dismissCookies(page);
    await page.waitForTimeout(3_000);
    await scrollPage(page);
    await page.waitForTimeout(1_500);
  } finally {
    page.off('response', onResponse);
  }

  return jsonPayloads;
}

async function saveDebugPage(page, prefix) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${prefix}.png`),
    fullPage: true,
  });

  await fs.writeFile(
    path.join(ARTIFACT_DIR, `${prefix}.html`),
    await page.content(),
    'utf8',
  );
}

async function scrapeMicrosoft(page) {
  const payloads = await collectPage(page, MICROSOFT_URL);

  const fromJson = payloads.flatMap(({ data, url }) =>
    extractMicrosoftFromJson(data, url),
  );

  const fromDom = await page.evaluate(() => {
    const tidy = (value = '') =>
      String(value).replace(/\s+/g, ' ').trim();

    const validName = (value) => {
      const product =
        /(azure|microsoft 365|windows server|security|identity|power platform|fabric|dynamics 365|devops|cybersecurity)/i;
      const level =
        /(expert|associate|specialty|fundamentals?|administrator|engineer|architect|developer|analyst)/i;

      return (
        value.length <= 180 &&
        product.test(value) &&
        level.test(value) &&
        !/^\s*-?\s*(?:Pass\s+)?Exam\b/i.test(value)
      );
    };

    const results = [];

    for (const heading of document.querySelectorAll(
      'h1, h2, h3, h4, h5, a',
    )) {
      const name = tidy(heading.textContent || '');
      if (!validName(name)) continue;

      let container = heading;

      for (
        let depth = 0;
        depth < 6 && container.parentElement;
        depth += 1
      ) {
        container = container.parentElement;
        const text = tidy(container.innerText || '');

        if (
          text.length >= name.length &&
          text.length <= 1800 &&
          /(earned|issued|expires?|renew|active|credential)/i.test(text)
        ) {
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
      status: /expired|inactive|retired|revoked/i.test(item.text)
        ? 'Expired'
        : 'Active',
      imageUrl: item.imageUrl,
      url: item.url || MICROSOFT_URL,
      source: 'Microsoft Learn',
    })),
  ];

  const certifications = deduplicate(combined).filter(
    (item) =>
      isMicrosoftCertificationName(item.name) &&
      !isExcludedBadge(item),
  );

  if (!certifications.length) {
    await saveDebugPage(page, 'microsoft-learn');

    throw new Error(
      'No Microsoft certifications were found. Debug HTML and screenshot were saved.',
    );
  }

  return certifications;
}

async function scrapeCredly(page) {
  const payloads = await collectPage(page, CREDLY_URL);

  const fromJson = payloads.flatMap(({ data }) =>
    extractCredlyFromJson(data),
  );

  const badgeLinks = await page
    .locator('a[href*="/badges/"]')
    .evaluateAll((anchors) => [
      ...new Set(
        anchors
          .map((anchor) => anchor.href)
          .filter((href) =>
            /^https:\/\/www\.credly\.com\/badges\/[^/?#]+(?:\/public_url)?$/i.test(
              href,
            ),
          )
          .map((href) => href.replace(/\/public_url$/, '')),
      ),
    ]);

  const fromDetails = [];

  for (const url of badgeLinks.slice(0, MAX_CREDLY_DETAIL_PAGES)) {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
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

    if (!detail.name || isExcludedBadge(detail.name)) continue;

    const item = {
      name: clean(detail.name),
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
      status: /expired|revoked|inactive|retired/i.test(detail.body)
        ? 'Expired'
        : 'Active',
      imageUrl: detail.imageUrl,
      url,
      source: 'Credly',
    };

    // Microsoft badges from Credly are intentionally ignored.
    if (isHashiCorpCredential(item)) fromDetails.push(item);
  }

  const badges = deduplicate([
    ...fromJson,
    ...fromDetails,
  ]).filter(isHashiCorpCredential);

  if (!badges.length) {
    await page.goto(CREDLY_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await saveDebugPage(page, 'credly');

    throw new Error(
      'No non-Microsoft HashiCorp credentials were found on Credly. Debug files were saved.',
    );
  }

  return badges;
}

function imageExtension(contentType, imageUrl) {
  const byType = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };

  if (byType[contentType]) return byType[contentType];

  try {
    const pathname = new URL(imageUrl).pathname;
    const extension = path
      .extname(pathname)
      .replace('.', '')
      .toLowerCase();

    return ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(extension)
      ? extension.replace('jpeg', 'jpg')
      : 'png';
  } catch {
    return 'png';
  }
}

function imageSlug(name) {
  return displayName(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureLocalImage(item) {
  if (!item.imageUrl) return '';

  await fs.mkdir(IMAGE_DIR, { recursive: true });

  let response;

  try {
    response = await fetch(item.imageUrl, {
      headers: {
        'User-Agent': 'RAWRitsCloud certification sync',
      },
    });
  } catch {
    return '';
  }

  if (!response.ok) return '';

  const contentType = (
    response.headers.get('content-type') || ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();

  const extension = imageExtension(contentType, item.imageUrl);
  const filename = `${imageSlug(item.name)}.${extension}`;
  const destination = path.join(IMAGE_DIR, filename);

  try {
    await fs.access(destination);
    return filename;
  } catch {
    await fs.writeFile(
      destination,
      Buffer.from(await response.arrayBuffer()),
    );
    return filename;
  }
}

function validateSchema(current) {
  if (!Array.isArray(current?.sections)) {
    throw new Error(
      'certifications.yml must contain a top-level sections array.',
    );
  }

  if (!Array.isArray(current?.legacy)) {
    throw new Error(
      'certifications.yml must contain a top-level legacy array.',
    );
  }

  for (const section of current.sections) {
    if (!section?.title || !Array.isArray(section.certs)) {
      throw new Error(
        'Every certification section must contain title and certs.',
      );
    }
  }
}

function credentialRecord(item, existing, image) {
  const record = {
    ...(existing || {}),
    name: existing?.name || displayName(item.name),
    image: existing?.image || image,
    level: existing?.level || inferLevel(item.name),
    date: displayDate(item.issued) || existing?.date || '',
  };

  if (item.expires) {
    record.expires = displayDate(item.expires);
  }

  if (item.url) {
    record.url = item.url;
  }

  record.source = item.source;

  return record;
}

async function buildOutput(current, microsoft, credly) {
  validateSchema(current);

  // Preserve all section titles and their order. Excluded badges are removed
  // wherever they currently exist.
  const sections = structuredClone(current.sections).map((section) => ({
    ...section,
    certs: section.certs.filter(
      (certificate) => !isExcludedBadge(certificate),
    ),
  }));

  const microsoftItems = deduplicate(
    microsoft.filter(
      (item) =>
        isMicrosoftCredential(item) &&
        !isExcludedBadge(item),
    ),
  );

  // Credly must never affect a Microsoft credential.
  const nonMicrosoftCredlyItems = deduplicate(
    credly.filter(
      (item) =>
        !isMicrosoftCredential(item) &&
        isHashiCorpCredential(item) &&
        !isExcludedBadge(item),
    ),
  );

  const activeMicrosoft = microsoftItems.filter(
    (item) => !isExpired(item),
  );
  const historicalMicrosoft = microsoftItems.filter(isExpired);

  const activeCredly = nonMicrosoftCredlyItems.filter(
    (item) => !isExpired(item),
  );
  const historicalCredly = nonMicrosoftCredlyItems.filter(isExpired);

  const microsoftActiveByName = new Map(
    activeMicrosoft.map((item) => [
      normaliseName(item.name),
      item,
    ]),
  );

  const microsoftHistoricalByName = new Map(
    historicalMicrosoft.map((item) => [
      normaliseName(item.name),
      item,
    ]),
  );

  const credlyActiveByName = new Map(
    activeCredly.map((item) => [
      normaliseName(item.name),
      item,
    ]),
  );

  const credlyHistoricalByName = new Map(
    historicalCredly.map((item) => [
      normaliseName(item.name),
      item,
    ]),
  );

  const allActiveKeys = new Set([
    ...microsoftActiveByName.keys(),
    ...credlyActiveByName.keys(),
  ]);

  // Remove debris created by earlier broken runs:
  // - excluded exam/testing badges
  // - anything marked Active inside legacy
  // - anything now confirmed active by its authoritative source
  const legacy = structuredClone(current.legacy).filter(
    (certificate) => {
      if (isExcludedBadge(certificate)) return false;
      if (/^active$/i.test(clean(certificate.status || ''))) {
        return false;
      }
      return !allActiveKeys.has(
        normaliseName(certificate.name),
      );
    },
  );

  const matchedActive = new Set();
  const movedToLegacy = [];

  for (const section of sections) {
    const source = sectionSource(section);

    // Sections outside Microsoft and HashiCorp are manual and untouched.
    if (source === 'manual') continue;

    const activeByName =
      source === 'microsoft'
        ? microsoftActiveByName
        : credlyActiveByName;

    const historicalByName =
      source === 'microsoft'
        ? microsoftHistoricalByName
        : credlyHistoricalByName;

    const retained = [];

    for (const certificate of section.certs) {
      const key = normaliseName(certificate.name);
      const active = activeByName.get(key);
      const historical = historicalByName.get(key);

      if (active) {
        matchedActive.add(key);

        retained.push(
          credentialRecord(
            active,
            certificate,
            certificate.image || '',
          ),
        );
        continue;
      }

      if (historical) {
        movedToLegacy.push({
          name: certificate.name,
          date:
            displayDate(historical.issued) ||
            certificate.date ||
            '',
          status: 'Expired',
        });
        continue;
      }

      // A missing scrape result is not enough evidence to delete or expire an
      // existing certificate. Most importantly, Credly absence can never alter
      // a Microsoft certificate.
      retained.push(certificate);
    }

    section.certs = retained;
  }

  const activeItems = [
    ...activeMicrosoft,
    ...activeCredly,
  ];

  const skipped = [];

  for (const item of activeItems) {
    const key = normaliseName(item.name);
    if (matchedActive.has(key)) continue;

    const sectionTitle = targetSection(item);
    const section = sections.find(
      (entry) => entry.title === sectionTitle,
    );

    if (!section) {
      skipped.push({
        name: item.name,
        reason: `No existing section named ${
          sectionTitle || '(unclassified)'
        }`,
      });
      continue;
    }

    const existing = section.certs.find(
      (certificate) =>
        normaliseName(certificate.name) === key,
    );

    if (existing) {
      matchedActive.add(key);
      continue;
    }

    const image = await ensureLocalImage(item);

    if (!image) {
      skipped.push({
        name: item.name,
        reason: 'No usable badge image was found',
      });
      continue;
    }

    section.certs.push(
      credentialRecord(item, null, image),
    );
    matchedActive.add(key);
  }

  const legacyKeys = new Set(
    legacy.map((item) => normaliseName(item.name)),
  );

  const historicalItems = [
    ...movedToLegacy,
    ...historicalMicrosoft,
    ...historicalCredly,
  ];

  for (const item of historicalItems) {
    const key = normaliseName(item.name);

    if (
      !key ||
      legacyKeys.has(key) ||
      allActiveKeys.has(key) ||
      isExcludedBadge(item)
    ) {
      continue;
    }

    legacy.push({
      name: displayName(item.name),
      date: displayDate(item.issued || item.date),
      status: 'Expired',
    });

    legacyKeys.add(key);
  }

  if (skipped.length) {
    await fs.mkdir(ARTIFACT_DIR, {
      recursive: true,
    });

    await fs.writeFile(
      path.join(
        ARTIFACT_DIR,
        'unmapped-certifications.json',
      ),
      `${JSON.stringify(skipped, null, 2)}\n`,
      'utf8',
    );

    console.warn(
      'Some new certifications need manual mapping:',
    );

    for (const item of skipped) {
      console.warn(`- ${item.name}: ${item.reason}`);
    }
  }

  return { sections, legacy };
}

function yamlScalar(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (value == null) return 'null';

  return JSON.stringify(value);
}

function orderedKeys(record, preferredOrder) {
  const preferred = preferredOrder.filter((key) =>
    Object.hasOwn(record, key),
  );

  const remaining = Object.keys(record).filter(
    (key) => !preferred.includes(key),
  );

  return [...preferred, ...remaining];
}

function appendRecord(
  lines,
  record,
  indent,
  preferredOrder,
) {
  const keys = orderedKeys(record, preferredOrder);

  if (!keys.length) {
    lines.push(`${indent}- {}`);
    return;
  }

  const [firstKey, ...otherKeys] = keys;

  lines.push(
    `${indent}- ${firstKey}: ${yamlScalar(
      record[firstKey],
    )}`,
  );

  for (const key of otherKeys) {
    lines.push(
      `${indent}  ${key}: ${yamlScalar(record[key])}`,
    );
  }
}

function dumpCertificationsYaml(data) {
  const lines = ['sections:'];

  for (const section of data.sections) {
    lines.push(
      `  - title: ${yamlScalar(section.title)}`,
    );

    if (!section.certs.length) {
      lines.push('    certs: []');
    } else {
      lines.push('    certs:');

      for (const certificate of section.certs) {
        appendRecord(
          lines,
          certificate,
          '      ',
          [
            'name',
            'image',
            'image_url',
            'level',
            'date',
            'expires',
            'status',
            'source',
            'url',
          ],
        );
      }
    }

    lines.push('');
  }

  lines.push('legacy:');

  if (!data.legacy.length) {
    lines[lines.length - 1] = 'legacy: []';
  } else {
    for (const certificate of data.legacy) {
      appendRecord(
        lines,
        certificate,
        '  ',
        ['name', 'date', 'status'],
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

async function runSelfTest() {
  const current = {
    sections: [
      {
        title: 'Microsoft Azure — Expert',
        certs: [
          {
            name: 'Azure Solutions Architect Expert',
            image: 'architect.png',
            level: 'Expert',
            date: 'Nov 2019',
          },
        ],
      },
      {
        title: 'Microsoft Azure — Associate',
        certs: [],
      },
      {
        title: 'Microsoft Azure — Specialty',
        certs: [],
      },
      {
        title: 'Microsoft — Fundamentals',
        certs: [
          {
            name: 'Power Platform Fundamentals',
            image: 'power-platform.png',
            level: 'Fundamental',
            date: '',
          },
        ],
      },
      {
        title: 'HashiCorp',
        certs: [
          {
            name: 'Terraform Associate',
            image: 'terraform.png',
            level: 'Associate',
            date: '',
          },
          {
            name:
              'Exam Contributor: Terraform Associate',
            image: 'exam-contributor.png',
            level: 'Associate',
            date: '',
          },
          {
            name:
              'Alpha Tester: Terraform Authoring and Operations Professional',
            image: 'alpha-tester.png',
            level: 'Professional',
            date: '',
          },
        ],
      },
    ],
    legacy: [
      {
        name: 'MCSE: SharePoint',
        date: 'Jul 2014',
      },
      {
        name: 'Power Platform Fundamentals',
        date: '',
        status: 'Active',
      },
      {
        name:
          'Pass Exam AZ-900: Microsoft Azure Fundamentals',
        date: '',
        status: 'Active',
      },
    ],
  };

  const microsoft = [
    {
      name:
        'Microsoft Certified: Azure Solutions Architect Expert',
      issuer: 'Microsoft',
      issued: '2025-01-10',
      expires: '2027-01-10',
      status: 'Active',
      source: 'Microsoft Learn',
      url: MICROSOFT_URL,
    },
    {
      name:
        'Microsoft Certified: Power Platform Fundamentals',
      issuer: 'Microsoft',
      issued: '2025-02-10',
      status: 'Active',
      source: 'Microsoft Learn',
      url: MICROSOFT_URL,
      imageUrl: '',
    },
  ];

  const credly = [
    {
      name:
        'HashiCorp Certified: Terraform Associate (003)',
      issuer: 'HashiCorp',
      issued: '2025-02-01',
      status: 'Active',
      source: 'Credly',
    },
    {
      name: 'Azure Administrator',
      issuer: 'Microsoft',
      issued: '2021-01-01',
      status: 'Active',
      source: 'Credly',
    },
    {
      name: 'Exam Contributor: Terraform Associate',
      issuer: 'HashiCorp',
      issued: '2025-02-01',
      status: 'Active',
      source: 'Credly',
    },
  ];

  const output = await buildOutput(
    current,
    microsoft,
    credly,
  );

  if (output.sections.length !== current.sections.length) {
    throw new Error(
      'Self-test failed: section count changed.',
    );
  }

  if (
    output.sections
      .map((section) => section.title)
      .join('|') !==
    current.sections
      .map((section) => section.title)
      .join('|')
  ) {
    throw new Error(
      'Self-test failed: section titles or order changed.',
    );
  }

  const architect = output.sections[0].certs[0];

  if (
    architect.image !== 'architect.png' ||
    architect.level !== 'Expert'
  ) {
    throw new Error(
      'Self-test failed: existing Microsoft certificate fields were not preserved.',
    );
  }

  const hashicorp = output.sections.find(
    (section) => section.title === HASHICORP_SECTION,
  );

  if (hashicorp.certs.some(isExcludedBadge)) {
    throw new Error(
      'Self-test failed: exam or testing badges were retained.',
    );
  }

  if (
    output.legacy.some(
      (item) =>
        /^active$/i.test(item.status || '') ||
        isExcludedBadge(item),
    )
  ) {
    throw new Error(
      'Self-test failed: active or excluded badges remained in legacy.',
    );
  }

  if (
    output.legacy.some(
      (item) =>
        normaliseName(item.name) ===
        normaliseName('Azure Administrator'),
    )
  ) {
    throw new Error(
      'Self-test failed: a Microsoft Credly badge affected legacy.',
    );
  }

  if (
    output.legacy.length !== 1 ||
    output.legacy[0].name !== 'MCSE: SharePoint'
  ) {
    throw new Error(
      'Self-test failed: manual legacy entries changed.',
    );
  }

  const serialised =
    dumpCertificationsYaml(output);

  if (
    !serialised.includes(
      'title: "Microsoft Azure — Expert"',
    )
  ) {
    throw new Error(
      'Self-test failed: YAML strings were not double quoted.',
    );
  }

  console.log(
    'Self-test passed: Microsoft Learn is authoritative for Microsoft, Credly is non-Microsoft only, exclusions work, and the YAML schema is preserved.',
  );
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  const [{ chromium }, yaml] = await Promise.all([
    import('playwright'),
    Promise.resolve(require('js-yaml')),
  ]);

  await fs.mkdir(ARTIFACT_DIR, {
    recursive: true,
  });

  const currentText = await fs.readFile(
    DATA_FILE,
    'utf8',
  );

  const current = yaml.load(currentText) || {};

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
    const microsoft = await scrapeMicrosoft(page);
    const credly = await scrapeCredly(page);

    const output = await buildOutput(
      current,
      microsoft,
      credly,
    );

    console.log(
      `Microsoft Learn certifications: ${microsoft.length}`,
    );

    console.log(
      `Non-Microsoft Credly credentials: ${credly.length}`,
    );

    const currentComparable = JSON.stringify({
      sections: current.sections,
      legacy: current.legacy,
    });

    const outputComparable = JSON.stringify(output);

    if (currentComparable === outputComparable) {
      console.log(
        'No certification changes detected.',
      );
      return;
    }

    await fs.writeFile(
      DATA_FILE,
      dumpCertificationsYaml(output),
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
