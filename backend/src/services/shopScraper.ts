import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { prisma } from '../lib/prisma.js';

export const CATEGORY_TREE = [
  { key: '호구', label: '호구', subcategories: ['일반호구set', '고급호구set', '호면', '호완', '갑', '갑상', '명패'] },
  { key: '죽도&목검&가검', label: '죽도 & 목검 & 가검', subcategories: ['일반죽도', '고급죽도', '시합용죽도', '여성용죽도', '일제죽도', '기타죽도', '목검', '가검', '좌대'] },
  { key: '죽도집&가방류', label: '죽도집 & 가방류', subcategories: ['죽도집/목검집', '호구가방', '기타가방', '심판기집'] },
  { key: '면수건', label: '면수건', subcategories: ['일반면수건', '고급면수건', '일본산면수건', '기타면수건'] },
  { key: '도복', label: '도복', subcategories: ['일반도복set', '고급도복set', '기능성도복set', '일본산도복set', '도복상의', '도복하의'] },
  { key: '보호대', label: '보호대', subcategories: ['턱땀받이', '손목', '팔꿈치', '무릎', '발', '기타', '테이핑'] },
  { key: '코등이/받침', label: '코등이/받침', subcategories: ['죽도 코등이', '죽도 코등이받침', '목검 코등이'] },
  { key: '액세서리', label: '액세서리', subcategories: [] }
];

// 이름 기반 재분류 — URL 매핑보다 우선
function reclassify(name: string, cat: string, sub: string | null): { category: string; subcategory: string | null } {
  const n = name;
  // 액세서리 강제
  if (/(열쇠고리|키링|키홀더|수리$|마스크|주머니|제습|탈취|방향|효자손|이름표|자수|도장|소품|호면가죽|귀갑|갑끈|어깨패드|갑.*패드|호구끈|면끈|갑상끈)/.test(n) && !/(호구세트|호구셋|세트$)/i.test(n)) {
    return { category: '액세서리', subcategory: null };
  }
  // 끈 단독 → 액세서리
  if (/끈/.test(n) && !/(호구세트|세트|set)/i.test(n)) return { category: '액세서리', subcategory: null };
  // 상의/하의 강제
  if (/상의/.test(n) && !/(호구|죽도|가검|목검|보호)/.test(n)) return { category: '도복', subcategory: '도복상의' };
  if (/하의/.test(n) && !/(호구|죽도|가검|목검|보호)/.test(n)) return { category: '도복', subcategory: '도복하의' };
  // 심판기집 → 죽도집&가방류
  if (/심판기집|심판.*집/.test(n)) return { category: '죽도집&가방류', subcategory: '심판기집' };
  // 호구가방
  if (/(호구.*가방|호구가방)/.test(n)) return { category: '죽도집&가방류', subcategory: '호구가방' };
  if (/(백팩|숄더|캐리어)/.test(n) && !/호구/.test(n)) return { category: '죽도집&가방류', subcategory: '기타가방' };
  // 죽도집
  if (/(죽도집|죽도가방|목검집)/.test(n) && cat !== '죽도집&가방류') return { category: '죽도집&가방류', subcategory: '죽도집/목검집' };
  // 면수건 일본산
  if (/면수건/.test(n) && /(일제|일본산|이원염|안보|부슈이치|마츠칸|나카지마|산케이|가제|busen|matsukan)/.test(n)) return { category: '면수건', subcategory: '일본산면수건' };
  if (/면수건/.test(n) && cat !== '면수건') return { category: '면수건', subcategory: '일반면수건' };
  // 보호대 세부
  if (/턱땀받이/.test(n)) return { category: '보호대', subcategory: '턱땀받이' };
  if (/손목.*보호|손목보호/.test(n)) return { category: '보호대', subcategory: '손목' };
  if (/팔꿈치/.test(n)) return { category: '보호대', subcategory: '팔꿈치' };
  if (/무릎/.test(n)) return { category: '보호대', subcategory: '무릎' };
  if (/(덧신|족대|뒷꿈치|발바닥|발.*보호)/.test(n)) return { category: '보호대', subcategory: '발' };
  if (/(테이프|테이핑)/.test(n)) return { category: '보호대', subcategory: '테이핑' };
  if (/안경/.test(n)) return { category: '보호대', subcategory: '기타' };
  // 코등이
  if (/코등이받침|츠바도메/.test(n)) return { category: '코등이/받침', subcategory: '죽도 코등이받침' };
  if (/목검.*코등이/.test(n)) return { category: '코등이/받침', subcategory: '목검 코등이' };
  if (/코등이/.test(n)) return { category: '코등이/받침', subcategory: '죽도 코등이' };
  return { category: cat, subcategory: sub };
}

const SHOP_SEEDS = [
  { key: 'kumdoshop', name: '검도샵', baseUrl: 'http://www.kumdoshop.co.kr' },
  { key: 'kumdomall', name: '검도몰', baseUrl: 'http://www.kumdomall.co.kr' },
  { key: 'woochangsports', name: '우창스포츠', baseUrl: 'https://woochangsports.net' },
  { key: 'kumdoland', name: '검도랜드', baseUrl: 'https://www.kumdoland.com' },
  { key: 'sehyun', name: '세현상사', baseUrl: 'https://sehyun-kumdo.com' },
  { key: 'igumdo', name: 'iGumdo', baseUrl: 'http://www.igumdo.com' },
  { key: 'dkumdo', name: '대도상사', baseUrl: 'https://dkumdo.kr' },
  { key: 'kendomall', name: '검도몰닷컴(나우TECH)', baseUrl: 'https://kendomall.com' }
];
export async function seedShops() { for (const s of SHOP_SEEDS) { await prisma.kendoShop.upsert({ where: { key: s.key }, update: { name: s.name, baseUrl: s.baseUrl, isActive: true }, create: { ...s, isActive: true } }); } }

async function fetchPage(url: string, encoding: 'utf-8' | 'euc-kr' = 'utf-8') {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  return encoding === 'euc-kr' ? iconv.decode(Buffer.from(r.data), 'euc-kr') : Buffer.from(r.data).toString('utf-8');
}

type SP = { name: string; price: number; originalPrice: number | null; imageUrl: string | null; productUrl: string; category: string; subcategory: string | null; shippingFee: number | null };
type CU = { url: string; category: string; subcategory: string | null };

async function scrapeCafe24(baseUrl: string, urls: CU[], encoding: 'utf-8' | 'euc-kr' = 'utf-8'): Promise<SP[]> {
  const all: SP[] = [];
  for (const cat of urls) {
    try {
      const html = await fetchPage(cat.url, encoding);
      const $ = cheerio.load(html);
      let maxPage = 1;
      $('a[href*="page="]').each((_, el) => { const m = ($(el).attr('href') ?? '').match(/page=(\d+)/); if (m) maxPage = Math.max(maxPage, Number(m[1])); });
      const parse = ($d: cheerio.CheerioAPI) => {
        $d('.xans-product-listnormal li, ul.prdList li').each((_, el) => {
          const $el = $d(el);
          const raw = ($el.find('.name a, .name span, .prd_name a, .item_name a').first().text() ?? '').trim();
          const name = raw.replace(/^상품명\s*:\s*/, '').trim();
          if (!name) return;
          const spec = $el.find('.spec, .mun, p.price, .xans-product-listitem-price').first().text() ?? '';
          const pm = spec.match(/판매가\s*:\s*([\d,]+)/);
          const pt = pm ? pm[1] : ($el.find('.price span, .sale_price').first().text() ?? '');
          const price = parsePrice(pt);
          if (!price && !/가격문의|문의/.test(spec)) return;
          const img = $el.find('img').first().attr('src') ?? $el.find('img').first().attr('data-src') ?? null;
          const imageUrl = img ? resolveUrl(baseUrl, img) : null;
          const href = $el.find('a').first().attr('href') ?? '';
          const productUrl = href ? resolveUrl(baseUrl, href) : '';
          if (!productUrl) return;
          const f = reclassify(name, cat.category, cat.subcategory);
          all.push({ name, price: price ?? 0, originalPrice: null, imageUrl, productUrl, category: f.category, subcategory: f.subcategory, shippingFee: null });
        });
      };
      parse($);
      for (let p = 2; p <= Math.min(maxPage, 10); p++) { try { const sep = cat.url.includes('?') ? '&' : '?'; parse(cheerio.load(await fetchPage(`${cat.url}${sep}page=${p}`, encoding))); } catch {} }
    } catch (err) { console.error(`[scrape] ${cat.url}`, err instanceof Error ? err.message : err); }
  }
  return all;
}

async function scrapeLegacy(baseUrl: string, urls: CU[]): Promise<SP[]> {
  const all: SP[] = [];
  for (const cat of urls) {
    try {
      const html = await fetchPage(cat.url, 'euc-kr');
      const $ = cheerio.load(html);
      $('table.MK_product_list tr, li[id^="anchorBoxId_"], div.item_box, .brand_prd_box li, ul.prdList li, .xans-product-listnormal li').each((_, el) => {
        const $el = $(el);
        const raw = ($el.find('a[href*="shopdetail"], a[href*="product_detail"]').first().text() ?? $el.find('.name a, .prd_name a').first().text() ?? '').trim();
        const name = raw.replace(/^상품명\s*:\s*/, '').replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2) return;
        const m = $el.text().match(/([\d,]+)\s*원/);
        const price = m ? parsePrice(m[1]) : null;
        if (!price) return;
        const img = $el.find('img').first().attr('src') ?? null;
        const imageUrl = img ? resolveUrl(baseUrl, img) : null;
        const href = $el.find('a[href*="shopdetail"], a[href*="product_detail"], a').first().attr('href') ?? '';
        const productUrl = href ? resolveUrl(baseUrl, href) : '';
        if (!productUrl) return;
        const f = reclassify(name, cat.category, cat.subcategory);
        all.push({ name, price, originalPrice: null, imageUrl, productUrl, category: f.category, subcategory: f.subcategory, shippingFee: null });
      });
    } catch (err) { console.error(`[scrape] ${cat.url}`, err instanceof Error ? err.message : err); }
  }
  return all;
}

// ═══ 우창스포츠 ═══
function getWoochangUrls(): CU[] {
  const b = 'https://woochangsports.net/category';
  return [
    { url: `${b}/%EA%B3%A0%EA%B8%89-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/281/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%EA%B3%A0%EA%B8%89-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/282/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%EC%9D%BC%EB%B0%98-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/148/`, category: '호구', subcategory: '일반호구set' },
    { url: `${b}/%EC%9D%BC%EB%B0%98-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/149/`, category: '호구', subcategory: '일반호구set' },
    { url: `${b}/%ED%98%B8%EB%A9%B4/223/`, category: '호구', subcategory: '호면' },
    { url: `${b}/%EA%B0%91/224/`, category: '호구', subcategory: '갑' },
    { url: `${b}/%ED%98%B8%EC%99%84/225/`, category: '호구', subcategory: '호완' },
    { url: `${b}/%EA%B0%91%EC%83%81/226/`, category: '호구', subcategory: '갑상' },
    { url: `${b}/%EB%AA%85%ED%8C%A8/240/`, category: '호구', subcategory: '명패' },
    { url: `${b}/%ED%98%B8%EA%B5%AC-%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/235/`, category: '액세서리', subcategory: null },
    { url: `${b}/%ED%98%B8%EA%B5%AC%EC%9D%B4%EB%A6%84%ED%91%9C/278/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EC%9D%BC%EB%B0%98%EB%8F%84%EB%B3%B5/220/`, category: '도복', subcategory: '일반도복set' },
    { url: `${b}/%EA%B3%A0%EA%B8%89%EB%8F%84%EB%B3%B5/221/`, category: '도복', subcategory: '고급도복set' },
    { url: `${b}/%EA%B8%B0%EB%8A%A5%EC%84%B1%EB%8F%84%EB%B3%B5/222/`, category: '도복', subcategory: '기능성도복set' },
    { url: `${b}/%EC%83%81%ED%95%98%EC%9D%98-%EC%84%B8%ED%8A%B8/184/`, category: '도복', subcategory: '고급도복set' },
    { url: `${b}/%EC%83%81%EC%9D%98/185/`, category: '도복', subcategory: '도복상의' },
    { url: `${b}/%ED%95%98%EC%9D%98/186/`, category: '도복', subcategory: '도복하의' },
    { url: `${b}/%EB%B6%80%EC%8A%88%EC%9D%B4%EC%B9%98/211/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%EB%A7%88%EC%B8%A0%EC%B9%B8/287/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%EB%82%98%EC%B9%B4%EC%A7%80%EB%A7%88/210/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%EC%82%B0%EC%BC%80%EC%9D%B4/212/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%EA%B0%80%EC%A0%9C/213/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%EB%8F%84%EB%B3%B5%EC%86%8C%ED%92%88/234/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EC%9D%BC%EB%B0%98%EC%A3%BD%EB%8F%84/170/`, category: '죽도&목검&가검', subcategory: '일반죽도' },
    { url: `${b}/%EA%B3%A0%EA%B8%89%EC%A3%BD%EB%8F%84/171/`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}/%EC%8B%9C%ED%95%A9%EC%9A%A9%EC%A3%BD%EB%8F%84/172/`, category: '죽도&목검&가검', subcategory: '시합용죽도' },
    { url: `${b}/%EC%97%AC%EC%84%B1%EC%9A%A9%EC%A3%BD%EB%8F%84/173/`, category: '죽도&목검&가검', subcategory: '여성용죽도' },
    { url: `${b}/%EC%95%8C%EC%A3%BD%EB%8F%84/174/`, category: '죽도&목검&가검', subcategory: '기타죽도' },
    { url: `${b}/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EC%95%8C%EC%A3%BD%EB%8F%84/175/`, category: '죽도&목검&가검', subcategory: '일제죽도' },
    { url: `${b}/%ED%8A%B9%EC%88%98%EC%A3%BD%EB%8F%84%ED%9B%88%EB%A0%A8%EC%9A%A9%EC%A3%BD%EB%8F%84/176/`, category: '죽도&목검&가검', subcategory: '기타죽도' },
    { url: `${b}/%EC%A3%BD%EB%8F%84%EC%86%8C%ED%92%88/177/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EB%AA%A9%EA%B2%80/100/`, category: '죽도&목검&가검', subcategory: '목검' },
    { url: `${b}/%EA%B0%80%EA%B2%80/101/`, category: '죽도&목검&가검', subcategory: '가검' },
    { url: `${b}/%EC%A2%8C%EB%8C%80/102/`, category: '죽도&목검&가검', subcategory: '좌대' },
    { url: `${b}/%EA%B8%B0%ED%83%80-%EC%86%8C%ED%92%88/103/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EB%AC%B4%EC%88%A0%EC%88%98%EB%A0%A8%EC%9E%A5%EB%B9%84/104/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EC%A3%BD%EB%8F%84-%EC%BD%94%EB%93%B1%EC%9D%B4/137/`, category: '코등이/받침', subcategory: '죽도 코등이' },
    { url: `${b}/%EC%A3%BD%EB%8F%84-%EC%BD%94%EB%93%B1%EC%9D%B4%EB%B0%9B%EC%B9%A8/138/`, category: '코등이/받침', subcategory: '죽도 코등이받침' },
    { url: `${b}/%EB%AA%A9%EA%B2%80-%EC%BD%94%EB%93%B1%EC%9D%B4/139/`, category: '코등이/받침', subcategory: '목검 코등이' },
    { url: `${b}/%EC%A3%BD%EB%8F%84%EC%A7%91%EB%AA%A9%EA%B2%80%EC%A7%91/62/`, category: '죽도집&가방류', subcategory: '죽도집/목검집' },
    { url: `${b}/%ED%98%B8%EA%B5%AC%EA%B0%80%EB%B0%A9/63/`, category: '죽도집&가방류', subcategory: '호구가방' },
    { url: `${b}/%ED%98%B8%EA%B5%AC%EA%B0%80%EB%B0%A9%EC%A3%BD%EB%8F%84%EC%A7%91-%EC%84%B8%ED%8A%B8/64/`, category: '죽도집&가방류', subcategory: '호구가방' },
    { url: `${b}/%EB%8F%84%EB%B3%B5%EA%B0%80%EB%B0%A9%EC%86%90%EA%B0%80%EB%B0%A9%ED%98%B8%EC%99%84%EA%B0%80%EB%B0%A9/65/`, category: '죽도집&가방류', subcategory: '기타가방' },
    { url: `${b}/%EC%8B%AC%ED%8C%90%EA%B8%B0%EC%A7%91/66/`, category: '죽도집&가방류', subcategory: '심판기집' },
    { url: `${b}/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EC%9D%B4%EC%9B%90%EC%97%BC-%EB%A9%B4%EC%88%98%EA%B1%B4/77/`, category: '면수건', subcategory: '일본산면수건' },
    { url: `${b}/%EC%9D%BC%EB%B3%B8%EC%82%B0-%EB%A9%B4%EC%88%98%EA%B1%B4/78/`, category: '면수건', subcategory: '일본산면수건' },
    { url: `${b}/%EA%B3%A0%EA%B8%89-%EB%A9%B4%EC%88%98%EA%B1%B4/79/`, category: '면수건', subcategory: '고급면수건' },
    { url: `${b}/%EB%AA%A8%EC%9E%90-%EB%A9%B4%EC%88%98%EA%B1%B4/80/`, category: '면수건', subcategory: '기타면수건' },
    { url: `${b}/%EC%95%88%EB%B3%B4-%EB%A9%B4%EC%88%98%EA%B1%B4/81/`, category: '면수건', subcategory: '일본산면수건' },
    { url: `${b}/%ED%84%B1%EB%95%80%EB%B0%9B%EC%9D%B4/33/`, category: '보호대', subcategory: '턱땀받이' },
    { url: `${b}/%EC%86%90%EB%AA%A9%ED%8C%94%EA%BF%88%EC%B9%98/34/`, category: '보호대', subcategory: '손목' },
    { url: `${b}/%EB%AC%B4%EB%A6%8E/35/`, category: '보호대', subcategory: '무릎' },
    { url: `${b}/%EB%B0%9C/36/`, category: '보호대', subcategory: '발' },
    { url: `${b}/%EA%B8%B0%ED%83%80/37/`, category: '보호대', subcategory: '기타' },
    { url: `${b}/%ED%85%8C%EC%9D%B4%ED%95%91/38/`, category: '보호대', subcategory: '테이핑' },
    { url: `${b}/%EC%9E%A0%EC%8A%A4%ED%8A%B8/39/`, category: '보호대', subcategory: null },
    { url: `${b}/%ED%83%88%EC%B7%A8%EC%A0%9C/236/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EC%9E%A5%EC%8B%9D%EC%9A%A9%ED%92%88/230/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EB%8F%84%EC%9E%A5%EC%9A%A9%ED%92%88/273/`, category: '액세서리', subcategory: null },
    { url: `${b}/%EA%B8%B0%ED%83%80%EC%86%8C%ED%92%88/237/`, category: '액세서리', subcategory: null },
  ];
}

function getKendomallComUrls(): CU[] {
  const b = 'https://kendomall.com/product/list.html?cate_no=';
  return [
    { url: `${b}24`, category: '호구', subcategory: null }, { url: `${b}25`, category: '도복', subcategory: null },
    { url: `${b}93`, category: '도복', subcategory: '일반도복set' }, { url: `${b}92`, category: '도복', subcategory: '고급도복set' },
    { url: `${b}70`, category: '죽도&목검&가검', subcategory: '일반죽도' }, { url: `${b}69`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}84`, category: '죽도&목검&가검', subcategory: '고급죽도' }, { url: `${b}87`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}71`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}4`, category: '죽도집&가방류', subcategory: '죽도집/목검집' },
    { url: `${b}38`, category: '죽도&목검&가검', subcategory: '목검' }, { url: `${b}39`, category: '죽도&목검&가검', subcategory: '가검' },
    { url: `${b}40`, category: '죽도&목검&가검', subcategory: '좌대' }, { url: `${b}28`, category: '죽도집&가방류', subcategory: '호구가방' },
    { url: `${b}31`, category: '액세서리', subcategory: null }, { url: `${b}32`, category: '액세서리', subcategory: null },
    { url: `${b}86`, category: '면수건', subcategory: '일반면수건' }, { url: `${b}30`, category: '보호대', subcategory: null },
    { url: `${b}27`, category: '액세서리', subcategory: null },
  ];
}

function getSehyunUrls(): CU[] {
  const b = 'https://sehyun-kumdo.com/category';
  return [
    { url: `${b}/%EC%84%B8%ED%8A%B8/83/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/men/85/`, category: '호구', subcategory: '호면' }, { url: `${b}/kote/86/`, category: '호구', subcategory: '호완' },
    { url: `${b}/mune-do/87/`, category: '호구', subcategory: '갑' }, { url: `${b}/tare/88/`, category: '호구', subcategory: '갑상' },
    { url: `${b}/%EC%84%B8%ED%8A%B8/104/`, category: '도복', subcategory: '고급도복set' },
    { url: `${b}/kendogi/102/`, category: '도복', subcategory: '도복상의' }, { url: `${b}/hakama/103/`, category: '도복', subcategory: '도복하의' },
    { url: `${b}/%ED%94%84%EB%A6%AC%EB%AF%B8%EC%97%84/92/`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}/madake-shinai/90/`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}/keichiku-shinai/91/`, category: '죽도&목검&가검', subcategory: '일반죽도' },
    { url: `${b}/bokken/93/`, category: '죽도&목검&가검', subcategory: '목검' },
    { url: `${b}/%E5%AE%89%E4%BF%A1%E5%95%86%E4%BC%9A/95/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%E3%83%92%E3%83%AD%E3%83%A4/94/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%E8%A5%BF%E6%97%A5%E6%9C%AC%E6%AD%A6%E9%81%93%E5%85%B7/121/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%E6%B0%B8%E6%A5%BD%E5%B1%8B/97/`, category: '면수건', subcategory: '일본산면수건' },
    { url: `${b}/busen/143/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%E9%A3%AF%E7%94%B0%E6%AD%A6%E9%81%93%E5%85%B7/149/`, category: '호구', subcategory: '고급호구set' },
    { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=96', category: '호구', subcategory: '고급호구set' },
    { url: `${b}/tsuba-dome/105/`, category: '코등이/받침', subcategory: '죽도 코등이' },
    { url: `${b}/himo/106/`, category: '액세서리', subcategory: null }, { url: `${b}/chichikawa-men/107/`, category: '액세서리', subcategory: null },
    { url: `${b}/nahuda/108/`, category: '호구', subcategory: '명패' }, { url: `${b}/tenugui/109/`, category: '면수건', subcategory: '일본산면수건' },
    { url: `${b}/protector/110/`, category: '보호대', subcategory: null }, { url: `${b}/etc/111/`, category: '액세서리', subcategory: null },
  ];
}

function getKumdomallUrls(): CU[] {
  const b = 'http://www.kumdomall.co.kr/shop/shopbrand.html';
  return [
    { url: `${b}?type=X&xcode=042`, category: '호구', subcategory: null }, { url: `${b}?type=X&xcode=043`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=O&xcode=046`, category: '죽도집&가방류', subcategory: null }, { url: `${b}?type=X&xcode=044`, category: '도복', subcategory: null },
    { url: `${b}?type=O&xcode=045`, category: '보호대', subcategory: null }, { url: `${b}?type=X&xcode=048`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=O&xcode=049`, category: '액세서리', subcategory: null },
  ];
}
function getKumdoshopUrls(): CU[] {
  const b = 'http://www.kumdoshop.co.kr/shop/shopbrand.html';
  return [
    { url: `${b}?xcode=004&type=X`, category: '호구', subcategory: null }, { url: `${b}?xcode=007&type=X`, category: '도복', subcategory: null },
    { url: `${b}?xcode=005&type=X`, category: '죽도&목검&가검', subcategory: null }, { url: `${b}?xcode=002&type=X`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?xcode=014&type=Y`, category: '죽도집&가방류', subcategory: null }, { url: `${b}?xcode=006&type=X`, category: '보호대', subcategory: null },
    { url: `${b}?xcode=015&type=Y`, category: '액세서리', subcategory: null },
  ];
}
function getKumdolandUrls(): CU[] {
  const b = 'https://www.kumdoland.com/shop/shopbrand.html';
  return [
    { url: `${b}?type=X&xcode=001`, category: '호구', subcategory: null }, { url: `${b}?type=X&xcode=002`, category: '호구', subcategory: null },
    { url: `${b}?type=X&xcode=046`, category: '도복', subcategory: null }, { url: `${b}?type=X&xcode=004`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=X&xcode=010`, category: '죽도&목검&가검', subcategory: null }, { url: `${b}?type=X&xcode=011`, category: '액세서리', subcategory: null },
    { url: `${b}?type=X&xcode=012`, category: '죽도집&가방류', subcategory: null }, { url: `${b}?type=X&xcode=013`, category: '보호대', subcategory: null },
  ];
}
function getIgumdoUrls(): CU[] { return []; }
function getDkumdoUrls(): CU[] {
  return [
    { url: 'https://dkumdo.kr/product/list.html?cate_no=42', category: '호구', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=43', category: '죽도&목검&가검', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=44', category: '도복', subcategory: null },
  ];
}

const SHOP_CONFIG: Record<string, { getUrls: () => CU[]; scraper: 'cafe24' | 'legacy'; encoding: 'utf-8' | 'euc-kr' }> = {
  woochangsports: { getUrls: getWoochangUrls, scraper: 'cafe24', encoding: 'utf-8' },
  kendomall: { getUrls: getKendomallComUrls, scraper: 'cafe24', encoding: 'utf-8' },
  sehyun: { getUrls: getSehyunUrls, scraper: 'cafe24', encoding: 'utf-8' },
  dkumdo: { getUrls: getDkumdoUrls, scraper: 'cafe24', encoding: 'utf-8' },
  kumdoshop: { getUrls: getKumdoshopUrls, scraper: 'legacy', encoding: 'euc-kr' },
  kumdomall: { getUrls: getKumdomallUrls, scraper: 'legacy', encoding: 'euc-kr' },
  kumdoland: { getUrls: getKumdolandUrls, scraper: 'legacy', encoding: 'euc-kr' },
  igumdo: { getUrls: getIgumdoUrls, scraper: 'legacy', encoding: 'euc-kr' },
};

export async function runSingleShopScrape(shopKey: string) {
  const c = SHOP_CONFIG[shopKey]; if (!c) return { shopKey, error: 'unknown', scraped: 0, saved: 0 };
  const shop = await prisma.kendoShop.findUnique({ where: { key: shopKey } }); if (!shop) return { shopKey, error: 'not-found', scraped: 0, saved: 0 };
  const urls = c.getUrls(); if (!urls.length) return { shopKey, scraped: 0, saved: 0 };
  const products = c.scraper === 'cafe24' ? await scrapeCafe24(shop.baseUrl, urls, c.encoding) : await scrapeLegacy(shop.baseUrl, urls);
  let saved = 0;
  for (const i of products) { try { await upsertScrapedProduct(shop.id, i); saved++; } catch (e) { console.error(`[s] ${i.name}`, e instanceof Error ? e.message : e); } }
  return { shopKey, scraped: products.length, saved };
}

export async function runFullScrape() {
  const r: Array<{ shopKey: string; scraped?: number; saved?: number; error?: string }> = [];
  for (const k of Object.keys(SHOP_CONFIG)) r.push(await runSingleShopScrape(k));
  await snapshotDailyPrices(); return r;
}

async function upsertScrapedProduct(shopId: string, item: SP) {
  const slug = genSlug(item.name);
  let p = await prisma.kendoProduct.findUnique({ where: { slug } });
  if (!p) p = await prisma.kendoProduct.create({ data: { name: item.name, slug, category: item.category, subcategory: item.subcategory, imageUrl: item.imageUrl } });
  else if (item.imageUrl && !p.imageUrl) await prisma.kendoProduct.update({ where: { id: p.id }, data: { imageUrl: item.imageUrl } });
  await prisma.kendoProductPrice.upsert({
    where: { productId_shopId: { productId: p.id, shopId } },
    update: { price: item.price, originalPrice: item.originalPrice, shippingFee: item.shippingFee, productUrl: item.productUrl, inStock: true, lastScrapedAt: new Date() },
    create: { productId: p.id, shopId, price: item.price, originalPrice: item.originalPrice, shippingFee: item.shippingFee, productUrl: item.productUrl, inStock: true }
  });
}

async function snapshotDailyPrices() {
  const today = new Date().toISOString().slice(0, 10);
  for (const p of await prisma.kendoProduct.findMany({ include: { prices: { select: { price: true } } } })) {
    const v = p.prices.map((x: { price: number }) => x.price).filter((x: number) => x > 0); if (!v.length) continue;
    const mn = Math.min(...v), mx = Math.max(...v), av = Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length);
    await prisma.kendoPriceHistory.upsert({ where: { productId_dateKey: { productId: p.id, dateKey: today } }, update: { minPrice: mn, maxPrice: mx, avgPrice: av }, create: { productId: p.id, dateKey: today, minPrice: mn, maxPrice: mx, avgPrice: av } });
  }
}

function parsePrice(t: string): number | null { const c = t.replace(/[^0-9]/g, ''); if (!c) return null; const v = Number(c); return Number.isFinite(v) && v > 0 ? v : null; }
function resolveUrl(b: string, p: string) { if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) return p.startsWith('//') ? `https:${p}` : p; return `${b.replace(/\/$/, '')}/${p.replace(/^\//, '')}`; }
function genSlug(n: string) { return n.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 200) || `product-${Date.now()}`; }
