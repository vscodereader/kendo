import axios from 'axios';
import * as cheerio from 'cheerio';

const GACHON_CATALOG_URL = 'https://www.gachon.ac.kr/kor/1097/subview.do';

export type ScrapedSource = {
  title: string;
  sourceUrl: string;
  publishedAt: Date | null;
  year: number | null;
  category: 'major' | 'general';
};

export async function fetchGachonSources(): Promise<ScrapedSource[]> {
  const firstPageHtml = await fetchPageHtml(1);
  const totalPages = extractTotalPages(firstPageHtml);

  const results = new Map<string, ScrapedSource>();

  for (let page = 1; page <= totalPages; page += 1) {
    const html = page === 1 ? firstPageHtml : await fetchPageHtml(page);
    const pageItems = extractSourcesFromHtml(html);

    for (const item of pageItems) {
      results.set(item.sourceUrl, item);
    }
  }

  return [...results.values()].sort((a, b) => {
    const yearDiff = (b.year ?? 0) - (a.year ?? 0);
    if (yearDiff !== 0) return yearDiff;

    const aTime = a.publishedAt?.getTime() ?? 0;
    const bTime = b.publishedAt?.getTime() ?? 0;
    return bTime - aTime;
  });
}

async function fetchPageHtml(page: number): Promise<string> {
  const url = new URL(GACHON_CATALOG_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }

  const response = await axios.get(url.toString(), {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  return response.data;
}

function extractTotalPages(html: string): number {
  const $ = cheerio.load(html);
  const bodyText = $.text().replace(/\s+/g, ' ').trim();

  const match = bodyText.match(/현재페이지\s*:\s*\d+\s*\/\s*(\d+)/);
  if (!match) return 1;

  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function extractSourcesFromHtml(html: string): ScrapedSource[] {
  const $ = cheerio.load(html);
  const results = new Map<string, ScrapedSource>();

  $('a').each((_, element) => {
    const href = $(element).attr('href')?.trim();
    const text = $(element).text().replace(/\s+/g, ' ').trim();

    if (!href || !text) return;
    if (!href.includes('ibook.gachon.ac.kr')) return;

    if (!/(총람|교육과정|교육과정요람|총람요람)/.test(text)) return;

    const match = text.match(/(?<year>\d{4})\.(?<month>\d{2})\.(?<day>\d{2})\s+(?<title>.+)/);
    const rawTitle = match?.groups?.title?.trim() ?? text;

    const year = match?.groups?.year ? Number(match.groups.year) : extractYear(rawTitle);
    const publishedAt =
      match?.groups?.year && match?.groups?.month && match?.groups?.day
        ? new Date(`${match.groups.year}-${match.groups.month}-${match.groups.day}T00:00:00+09:00`)
        : null;

    const category = inferCategory(rawTitle);
    const title = normalizeTitle(rawTitle, category);

    results.set(href, {
      title,
      sourceUrl: href,
      publishedAt,
      year,
      category
    });
  });

  return [...results.values()];
}

function extractYear(text: string): number | null {
  const match = text.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

function inferCategory(title: string): 'major' | 'general' {
  const normalized = title.replace(/\s+/g, '');

  if (normalized.includes('총람') || normalized.includes('교양')) {
    return 'general';
  }

  if (
    normalized.includes('전공교육과정') ||
    normalized.includes('교육과정요람') ||
    normalized.includes('교육과정')
  ) {
    return 'major';
  }

  return 'general';
}

function normalizeTitle(title: string, category: 'major' | 'general'): string {
  const year = extractYear(title);
  const compact = title.replace(/\s+/g, '');

  if (category === 'major') {
    if (year) return `${year}년 전공교육과정`;
    if (compact.includes('교육과정')) return '전공교육과정';
  }

  if (category === 'general') {
    if (year && (compact.includes('총람') || compact.includes('교양'))) {
      return `${year}년 총람 및 교양`;
    }
  }

  return title.replace(/\s+/g, ' ').trim();
}

export { GACHON_CATALOG_URL };