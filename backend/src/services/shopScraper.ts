import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { prisma } from '../lib/prisma.js';

// ═══════════════════════════════════════════════════════════
// 카테고리 트리 (프론트엔드에서도 사용)
// ═══════════════════════════════════════════════════════════
export const CATEGORY_TREE = [
  {
    key: '호구',
    label: '호구',
    subcategories: ['일반호구set', '고급호구set', '호면', '호완', '갑', '갑상', '명패']
  },
  {
    key: '죽도&목검&가검',
    label: '죽도 & 목검 & 가검',
    subcategories: ['일반죽도', '고급죽도', '시합용죽도', '여성용죽도', '일제죽도', '기타죽도', '목검', '가검', '좌대']
  },
  {
    key: '죽도집&가방류',
    label: '죽도집 & 가방류',
    subcategories: ['죽도집/목검집', '호구가방', '기타가방', '심판기집']
  },
  {
    key: '면수건',
    label: '면수건',
    subcategories: ['일반면수건', '고급면수건', '일본산면수건', '기타면수건']
  },
  {
    key: '도복',
    label: '도복',
    subcategories: ['일반도복set', '고급도복set', '기능성도복set', '일본산도복set', '도복상의', '도복하의']
  },
  {
    key: '보호대',
    label: '보호대',
    subcategories: ['턱땀받이', '손목', '팔꿈치', '무릎', '발', '기타', '테이핑']
  },
  {
    key: '코등이/받침',
    label: '코등이/받침',
    subcategories: ['죽도 코등이', '죽도 코등이받침', '목검 코등이']
  },
  {
    key: '액세서리',
    label: '액세서리',
    subcategories: []
  }
];

// ═══════════════════════════════════════════════════════════
// 키워드 기반 자동 분류 규칙
// ═══════════════════════════════════════════════════════════
type ClassifyResult = { category: string; subcategory: string | null };

function classifyByKeyword(name: string, defaultCat: string, defaultSub: string | null): ClassifyResult {
  const n = name.toLowerCase().replace(/\s+/g, '');

  // ── 상의/하의 우선 체크 (도복 관련) ──
  if (/상의/.test(name) && !/(호구|죽도|가검|목검|보호)/.test(name)) {
    return { category: '도복', subcategory: '도복상의' };
  }
  if (/하의/.test(name) && !/(호구|죽도|가검|목검|보호)/.test(name)) {
    return { category: '도복', subcategory: '도복하의' };
  }

  // ── 코등이/받침 ──
  if (/코등이받침|츠바도메|tsuba.*dome|코등이바침/.test(n)) return { category: '코등이/받침', subcategory: '죽도 코등이받침' };
  if (/목검.*코등이|목검코등이/.test(n)) return { category: '코등이/받침', subcategory: '목검 코등이' };
  if (/코등이/.test(n)) return { category: '코등이/받침', subcategory: '죽도 코등이' };

  // ── 죽도 분류 ──
  if (/시합용죽도|시합용/.test(n) && /죽도/.test(n)) return { category: '죽도&목검&가검', subcategory: '시합용죽도' };
  if (/여성용|여자/.test(n) && /죽도/.test(n)) return { category: '죽도&목검&가검', subcategory: '여성용죽도' };
  if (/(일제|일본산|진죽|토도로키)/.test(n) && /죽도/.test(n)) return { category: '죽도&목검&가검', subcategory: '일제죽도' };
  if (/(알죽도|특수죽도|훈련용죽도|훈련용)/.test(n) && /죽도/.test(n)) return { category: '죽도&목검&가검', subcategory: '기타죽도' };

  // ── 호구가방 / 죽도집 ──
  if (/호구가방|호구.*가방/.test(n)) return { category: '죽도집&가방류', subcategory: '호구가방' };
  if (/죽도집|죽도가방|목검집/.test(n)) return { category: '죽도집&가방류', subcategory: '죽도집/목검집' };
  if (/심판기집|심판.*집/.test(n)) return { category: '죽도집&가방류', subcategory: '심판기집' };
  if (/(도복가방|손가방|호완가방|캐리어|백팩|숄더)/.test(n) && /가방/.test(n)) return { category: '죽도집&가방류', subcategory: '기타가방' };

  // ── 면수건 ──
  if (/(일제|일본산|이원염|안보)/.test(n) && /면수건/.test(n)) return { category: '면수건', subcategory: '일본산면수건' };
  if (/모자면수건|모자.*면수건|면모자/.test(n)) return { category: '면수건', subcategory: '기타면수건' };
  if (/면수건/.test(n)) {
    if (/고급/.test(n)) return { category: '면수건', subcategory: '고급면수건' };
    return { category: '면수건', subcategory: '일반면수건' };
  }

  // ── 보호대 ──
  if (/턱땀받이|턱.*받이/.test(n)) return { category: '보호대', subcategory: '턱땀받이' };
  if (/손목보호|손목.*보호/.test(n)) return { category: '보호대', subcategory: '손목' };
  if (/팔꿈치|팔꿈.*보호/.test(n)) return { category: '보호대', subcategory: '팔꿈치' };
  if (/무릎보호|무릎.*보호|니.*보호/.test(n)) return { category: '보호대', subcategory: '무릎' };
  if (/(덧신|족대|뒷꿈치|발바닥|발보호|발.*보호)/.test(n)) return { category: '보호대', subcategory: '발' };
  if (/(테이프|테이핑|taping)/.test(n)) return { category: '보호대', subcategory: '테이핑' };
  if (/안경테|안경/.test(n)) return { category: '보호대', subcategory: '기타' };
  if (/보호대/.test(n)) return { category: '보호대', subcategory: '기타' };

  // ── 호구 분류 ──
  if (/명패|나후다|nahuda/.test(n)) return { category: '호구', subcategory: '명패' };
  if (/호면/.test(n) && !/가죽/.test(n)) return { category: '호구', subcategory: '호면' };
  if (/호완/.test(n)) return { category: '호구', subcategory: '호완' };
  if (/갑상/.test(n)) return { category: '호구', subcategory: '갑상' };
  if (/무네|갑(?!상)/.test(n) && /(호구|갑|무네)/.test(n)) return { category: '호구', subcategory: '갑' };

  // ── 도복 일본산 ──
  if (/(부슈이치|마츠칸|나카지마|산케이|가제|busen|matsukan|hiroya)/.test(n) && /(도복|상의|하의|set|세트)/.test(n)) {
    if (/상의/.test(name)) return { category: '도복', subcategory: '도복상의' };
    if (/하의/.test(name)) return { category: '도복', subcategory: '도복하의' };
    return { category: '도복', subcategory: '일본산도복set' };
  }

  // ── 가검/목검/좌대 ──
  if (/가검/.test(n)) return { category: '죽도&목검&가검', subcategory: '가검' };
  if (/목검|목도/.test(n)) return { category: '죽도&목검&가검', subcategory: '목검' };
  if (/좌대/.test(n)) return { category: '죽도&목검&가검', subcategory: '좌대' };

  return { category: defaultCat, subcategory: defaultSub };
}

// ═══════════════════════════════════════════════════════════
// 쇼핑몰 시드 데이터
// ═══════════════════════════════════════════════════════════
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

export async function seedShops() {
  for (const seed of SHOP_SEEDS) {
    await prisma.kendoShop.upsert({
      where: { key: seed.key },
      update: { name: seed.name, baseUrl: seed.baseUrl, isActive: true },
      create: { key: seed.key, name: seed.name, baseUrl: seed.baseUrl, isActive: true }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 페이지 가져오기
// ═══════════════════════════════════════════════════════════
async function fetchPage(url: string, encoding: 'utf-8' | 'euc-kr' = 'utf-8') {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (encoding === 'euc-kr') return iconv.decode(Buffer.from(response.data), 'euc-kr');
  return Buffer.from(response.data).toString('utf-8');
}

// ═══════════════════════════════════════════════════════════
// 스크래핑 타입
// ═══════════════════════════════════════════════════════════
type ScrapedProduct = {
  name: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  productUrl: string;
  category: string;
  subcategory: string | null;
  shippingFee: number | null;
};

type CategoryUrl = { url: string; category: string; subcategory: string | null };

// ═══════════════════════════════════════════════════════════
// Cafe24 스크래퍼 (우창, 세현, 검도랜드, 대도, kendomall)
// ═══════════════════════════════════════════════════════════
async function scrapeCafe24(baseUrl: string, urls: CategoryUrl[], encoding: 'utf-8' | 'euc-kr' = 'utf-8'): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  for (const cat of urls) {
    try {
      const html = await fetchPage(cat.url, encoding);
      const $ = cheerio.load(html);
      $('.xans-product-listnormal li, ul.prdList li').each((_, el) => {
        const $el = $(el);
        const rawName = ($el.find('.name a, .name span, .prd_name a, .item_name a').first().text() ?? '').trim();
        const name = rawName.replace(/^상품명\s*:\s*/, '').trim();
        if (!name) return;

        const specText = $el.find('.spec, .mun, p.price, .xans-product-listitem-price').first().text() ?? '';
        const priceMatch = specText.match(/판매가\s*:\s*([\d,]+)/);
        const priceText = priceMatch ? priceMatch[1] : ($el.find('.price span, .sale_price').first().text() ?? '');
        const price = parsePrice(priceText);

        // "가격문의" 처리
        const isPriceInquiry = !price && /가격문의|가격\s*문의|문의/.test(specText);
        if (!price && !isPriceInquiry) return;

        const imgSrc = $el.find('img').first().attr('src') ?? $el.find('img').first().attr('data-src') ?? null;
        const imageUrl = imgSrc ? resolveUrl(baseUrl, imgSrc) : null;
        const href = $el.find('a').first().attr('href') ?? '';
        const productUrl = href ? resolveUrl(baseUrl, href) : '';
        if (!productUrl) return;

        const classified = classifyByKeyword(name, cat.category, cat.subcategory);
        all.push({
          name,
          price: price ?? 0,
          originalPrice: null,
          imageUrl,
          productUrl,
          category: classified.category,
          subcategory: classified.subcategory,
          shippingFee: null
        });
      });
    } catch (err) {
      console.error(`[scrape] 실패: ${cat.url}`, err instanceof Error ? err.message : err);
    }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// 구형 쇼핑몰 스크래퍼 (검도샵, 검도몰 - EUC-KR, 테이블 기반)
// ═══════════════════════════════════════════════════════════
async function scrapeLegacyShop(baseUrl: string, urls: CategoryUrl[]): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  for (const cat of urls) {
    try {
      const html = await fetchPage(cat.url, 'euc-kr');
      const $ = cheerio.load(html);

      // 다양한 셀렉터 시도
      $('table.MK_product_list tr, .prd_item, li[id^="anchorBoxId_"], div.item_box, .brand_prd_box li, ul.prdList li, .xans-product-listnormal li').each((_, el) => {
        const $el = $(el);
        const rawName = ($el.find('a[href*="shopdetail"], a[href*="product_detail"]').first().text()
          ?? $el.find('.name a, .prd_name a').first().text() ?? '').trim();
        const name = rawName.replace(/^상품명\s*:\s*/, '').replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2) return;

        const allText = $el.text();
        const priceMatch = allText.match(/([\d,]+)\s*원/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : null;
        if (!price) return;

        const imgSrc = $el.find('img').first().attr('src') ?? null;
        const imageUrl = imgSrc ? resolveUrl(baseUrl, imgSrc) : null;
        const href = $el.find('a[href*="shopdetail"], a[href*="product_detail"], a').first().attr('href') ?? '';
        const productUrl = href ? resolveUrl(baseUrl, href) : '';
        if (!productUrl) return;

        const classified = classifyByKeyword(name, cat.category, cat.subcategory);
        all.push({ name, price, originalPrice: null, imageUrl, productUrl, category: classified.category, subcategory: classified.subcategory, shippingFee: null });
      });
    } catch (err) {
      console.error(`[scrape] 실패: ${cat.url}`, err instanceof Error ? err.message : err);
    }
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// 우창스포츠 URL (실제 확인된 URL)
// ═══════════════════════════════════════════════════════════
function getWoochangUrls(): CategoryUrl[] {
  const b = 'https://woochangsports.net/category';
  return [
    // 호구
    { url: `${b}/%EA%B3%A0%EA%B8%89-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/281/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%EC%9D%BC%EB%B0%98-%EC%88%98%EC%A0%9C%ED%98%B8%EA%B5%AC/148/`, category: '호구', subcategory: '일반호구set' },
    { url: `${b}/%EA%B3%A0%EA%B8%89-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/282/`, category: '호구', subcategory: '고급호구set' },
    { url: `${b}/%EC%9D%BC%EB%B0%98-%EA%B8%B0%EA%B3%84%EC%8B%9D%ED%98%B8%EA%B5%AC/283/`, category: '호구', subcategory: '일반호구set' },
    { url: `${b}/%ED%98%B8%EB%A9%B4/223/`, category: '호구', subcategory: '호면' },
    { url: `${b}/%EA%B0%91/224/`, category: '호구', subcategory: '갑' },
    { url: `${b}/%ED%98%B8%EC%99%84/225/`, category: '호구', subcategory: '호완' },
    { url: `${b}/%EA%B0%91%EC%83%81/226/`, category: '호구', subcategory: '갑상' },
    { url: `${b}/%EB%AA%85%ED%8C%A8/240/`, category: '호구', subcategory: '명패' },
    { url: `${b}/%ED%98%B8%EA%B5%AC-%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/235/`, category: '액세서리', subcategory: null },
    { url: `${b}/%ED%98%B8%EA%B5%AC%EC%9D%B4%EB%A6%84%ED%91%9C/236/`, category: '액세서리', subcategory: null },
    // 도복
    { url: `${b}/%EB%8F%84%EB%B3%B5/141/`, category: '도복', subcategory: null },
    // 죽도
    { url: `${b}/%EC%A3%BD%EB%8F%84/169/`, category: '죽도&목검&가검', subcategory: null },
    // 목검/가검
    { url: `${b}/%EB%AA%A9%EA%B2%80%EA%B0%80%EA%B2%80/99/`, category: '죽도&목검&가검', subcategory: null },
    // 코등이/받침
    { url: `${b}/%EC%BD%94%EB%93%B1%EC%9D%B4%EB%B0%9B%EC%B9%A8/136/`, category: '코등이/받침', subcategory: null },
    // 가방
    { url: `${b}/%EA%B0%80%EB%B0%A9/61/`, category: '죽도집&가방류', subcategory: null },
    // 면수건
    { url: `${b}/%EB%A9%B4%EC%88%98%EA%B1%B4/76/`, category: '면수건', subcategory: null },
    // 보호대
    { url: `${b}/%EB%B3%B4%ED%98%B8%EB%8C%80/27/`, category: '보호대', subcategory: null },
    // 액세서리
    { url: `${b}/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/134/`, category: '액세서리', subcategory: null },
    // 신상품/특가
    { url: `${b}/%EC%8B%A0%EC%83%81%ED%92%88/238/`, category: '액세서리', subcategory: null },
    { url: `${b}/%ED%8A%B9%EA%B0%80%ED%95%A0%EC%9D%B8/158/`, category: '액세서리', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 검도몰닷컴 (나우TECH) URL
// ═══════════════════════════════════════════════════════════
function getKendomallComUrls(): CategoryUrl[] {
  const b = 'https://kendomall.com/product/list.html?cate_no=';
  return [
    // 호구
    { url: `${b}24`, category: '호구', subcategory: null },
    // 도복
    { url: `${b}25`, category: '도복', subcategory: null },
    { url: `${b}93`, category: '도복', subcategory: '일반도복set' },
    { url: `${b}92`, category: '도복', subcategory: '고급도복set' },
    // 죽도
    { url: `${b}70`, category: '죽도&목검&가검', subcategory: '일반죽도' },
    { url: `${b}69`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}84`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}87`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    { url: `${b}71`, category: '죽도&목검&가검', subcategory: '고급죽도' },
    // 죽도집
    { url: `${b}4`, category: '죽도집&가방류', subcategory: '죽도집/목검집' },
    // 목검/가검/좌대
    { url: `${b}38`, category: '죽도&목검&가검', subcategory: '목검' },
    { url: `${b}39`, category: '죽도&목검&가검', subcategory: '가검' },
    { url: `${b}40`, category: '죽도&목검&가검', subcategory: '좌대' },
    // 호구가방
    { url: `${b}28`, category: '죽도집&가방류', subcategory: '호구가방' },
    // 액세서리
    { url: `${b}31`, category: '액세서리', subcategory: null },
    { url: `${b}32`, category: '액세서리', subcategory: null },
    { url: `${b}86`, category: '면수건', subcategory: null },
    { url: `${b}30`, category: '보호대', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 세현상사 URL
// ═══════════════════════════════════════════════════════════
function getSehyunUrls(): CategoryUrl[] {
  const b = 'https://sehyun-kumdo.com/category';
  return [
    // 호구
    { url: `${b}/%EC%84%B8%ED%8A%B8/83/`, category: '호구', subcategory: null },
    { url: `${b}/men/85/`, category: '호구', subcategory: null },
    { url: `${b}/kote/86/`, category: '호구', subcategory: '호완' },
    { url: `${b}/mune-do/87/`, category: '호구', subcategory: '갑' },
    { url: `${b}/tare/88/`, category: '호구', subcategory: '갑상' },
    // 도복
    { url: `${b}/%EC%84%B8%ED%8A%B8/104/`, category: '도복', subcategory: null },
    { url: `${b}/kendogi/102/`, category: '도복', subcategory: '도복상의' },
    { url: `${b}/hakama/103/`, category: '도복', subcategory: '도복하의' },
    // 죽도
    { url: `${b}/%ED%94%84%EB%A6%AC%EB%AF%B8%EC%97%84/92/`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}/madake-shinai/90/`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}/keichiku-shinai/91/`, category: '죽도&목검&가검', subcategory: null },
    // 목검
    { url: `${b}/bokken/93/`, category: '죽도&목검&가검', subcategory: '목검' },
    // 일본산 브랜드 (호구/도복/죽도 혼합)
    { url: `${b}/%E5%AE%89%E4%BF%A1%E5%95%86%E4%BC%9A/95/`, category: '호구', subcategory: null },
    { url: `${b}/%E3%83%92%E3%83%AD%E3%83%A4/94/`, category: '호구', subcategory: null },
    { url: `${b}/%E8%A5%BF%E6%97%A5%E6%9C%AC%E6%AD%A6%E9%81%93%E5%85%B7/121/`, category: '호구', subcategory: null },
    { url: `${b}/%E6%B0%B8%E6%A5%BD%E5%B1%8B/97/`, category: '면수건', subcategory: null },
    { url: `${b}/busen/143/`, category: '도복', subcategory: '일본산도복set' },
    { url: `${b}/%E9%A3%AF%E7%94%B0%E6%AD%A6%E9%81%93%E5%85%B7/149/`, category: '호구', subcategory: null },
    { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=96', category: '호구', subcategory: null },
    // 악세서리
    { url: `${b}/tsuba-dome/105/`, category: '코등이/받침', subcategory: null },
    { url: `${b}/himo/106/`, category: '액세서리', subcategory: null },
    { url: `${b}/chichikawa-men/107/`, category: '액세서리', subcategory: null },
    { url: `${b}/nahuda/108/`, category: '호구', subcategory: '명패' },
    { url: `${b}/tenugui/109/`, category: '면수건', subcategory: null },
    { url: `${b}/protector/110/`, category: '보호대', subcategory: null },
    { url: `${b}/etc/111/`, category: '액세서리', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 검도몰 URL (EUC-KR)
// ═══════════════════════════════════════════════════════════
function getKumdomallUrls(): CategoryUrl[] {
  const b = 'http://www.kumdomall.co.kr/shop/shopbrand.html';
  return [
    { url: `${b}?type=X&xcode=042`, category: '호구', subcategory: null },
    { url: `${b}?type=X&xcode=043`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=O&xcode=046`, category: '죽도집&가방류', subcategory: null },
    { url: `${b}?type=X&xcode=044`, category: '도복', subcategory: null },
    { url: `${b}?type=O&xcode=045`, category: '보호대', subcategory: null },
    { url: `${b}?type=X&xcode=048`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=O&xcode=049`, category: '액세서리', subcategory: null },
    { url: `${b}?type=Y&xcode=047`, category: '액세서리', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 검도샵 URL (EUC-KR)
// ═══════════════════════════════════════════════════════════
function getKumdoshopUrls(): CategoryUrl[] {
  const b = 'http://www.kumdoshop.co.kr/shop/shopbrand.html';
  return [
    { url: `${b}?xcode=004&type=X`, category: '호구', subcategory: null },
    { url: `${b}?xcode=007&type=X`, category: '도복', subcategory: null },
    { url: `${b}?xcode=005&type=X`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?xcode=002&type=X`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?xcode=014&type=Y`, category: '죽도집&가방류', subcategory: null },
    { url: `${b}?xcode=006&type=X`, category: '보호대', subcategory: null },
    { url: `${b}?xcode=015&type=Y`, category: '액세서리', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 검도랜드 URL (EUC-KR)
// ═══════════════════════════════════════════════════════════
function getKumdolandUrls(): CategoryUrl[] {
  const b = 'https://www.kumdoland.com/shop/shopbrand.html';
  return [
    { url: `${b}?type=X&xcode=001`, category: '호구', subcategory: null },
    { url: `${b}?type=X&xcode=002`, category: '호구', subcategory: null },
    { url: `${b}?type=X&xcode=046`, category: '도복', subcategory: null },
    { url: `${b}?type=X&xcode=004`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=X&xcode=010`, category: '죽도&목검&가검', subcategory: null },
    { url: `${b}?type=X&xcode=011`, category: '액세서리', subcategory: null },
    { url: `${b}?type=X&xcode=012`, category: '죽도집&가방류', subcategory: null },
    { url: `${b}?type=X&xcode=013`, category: '보호대', subcategory: null },
    { url: `${b}?type=X&xcode=014`, category: '액세서리', subcategory: null },
    { url: `${b}?type=O&xcode=034`, category: '액세서리', subcategory: null },
    { url: `${b}?type=Y&xcode=015`, category: '액세서리', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// iGumdo / 대도상사 URL
// ═══════════════════════════════════════════════════════════
function getIgumdoUrls(): CategoryUrl[] {
  return [
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=01000000', category: '호구', subcategory: null },
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=02000000', category: '죽도&목검&가검', subcategory: null },
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=03000000', category: '도복', subcategory: null },
  ];
}

function getDkumdoUrls(): CategoryUrl[] {
  return [
    { url: 'https://dkumdo.kr/product/list.html?cate_no=42', category: '호구', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=43', category: '죽도&목검&가검', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=44', category: '도복', subcategory: null },
  ];
}

// ═══════════════════════════════════════════════════════════
// 스크래핑 실행
// ═══════════════════════════════════════════════════════════
const SHOP_CONFIG: Record<string, { getUrls: () => CategoryUrl[]; scraper: 'cafe24' | 'legacy'; encoding: 'utf-8' | 'euc-kr' }> = {
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
  const config = SHOP_CONFIG[shopKey];
  if (!config) return { shopKey, error: 'unknown-shop', scraped: 0, saved: 0 };

  const shop = await prisma.kendoShop.findUnique({ where: { key: shopKey } });
  if (!shop) return { shopKey, error: 'shop-not-found', scraped: 0, saved: 0 };

  const urls = config.getUrls();
  const products = config.scraper === 'cafe24'
    ? await scrapeCafe24(shop.baseUrl, urls, config.encoding)
    : await scrapeLegacyShop(shop.baseUrl, urls);

  let saved = 0;
  for (const item of products) {
    try {
      await upsertScrapedProduct(shop.id, item);
      saved++;
    } catch (err) {
      console.error(`[scrape] 저장 실패: ${item.name}`, err instanceof Error ? err.message : err);
    }
  }
  return { shopKey, scraped: products.length, saved };
}

export async function runFullScrape() {
  const results: Array<{ shopKey: string; scraped?: number; saved?: number; error?: string }> = [];
  for (const shopKey of Object.keys(SHOP_CONFIG)) {
    const result = await runSingleShopScrape(shopKey);
    results.push(result);
  }
  await snapshotDailyPrices();
  return results;
}

// ═══════════════════════════════════════════════════════════
// DB 저장
// ═══════════════════════════════════════════════════════════
async function upsertScrapedProduct(shopId: string, item: ScrapedProduct) {
  const slug = generateSlug(item.name);
  let product = await prisma.kendoProduct.findUnique({ where: { slug } });
  if (!product) {
    product = await prisma.kendoProduct.create({
      data: { name: item.name, slug, category: item.category, subcategory: item.subcategory, imageUrl: item.imageUrl }
    });
  } else {
    if (item.imageUrl && !product.imageUrl) {
      await prisma.kendoProduct.update({ where: { id: product.id }, data: { imageUrl: item.imageUrl } });
    }
  }
  await prisma.kendoProductPrice.upsert({
    where: { productId_shopId: { productId: product.id, shopId } },
    update: { price: item.price, originalPrice: item.originalPrice, shippingFee: item.shippingFee, productUrl: item.productUrl, inStock: true, lastScrapedAt: new Date() },
    create: { productId: product.id, shopId, price: item.price, originalPrice: item.originalPrice, shippingFee: item.shippingFee, productUrl: item.productUrl, inStock: true }
  });
}

async function snapshotDailyPrices() {
  const today = new Date().toISOString().slice(0, 10);
  const products = await prisma.kendoProduct.findMany({ include: { prices: { select: { price: true } } } });
  for (const product of products) {
    if (product.prices.length === 0) continue;
    const vals = product.prices.map((p: { price: number }) => p.price).filter((v: number) => v > 0);
    if (vals.length === 0) continue;
    const minPrice = Math.min(...vals);
    const maxPrice = Math.max(...vals);
    const avgPrice = Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length);
    await prisma.kendoPriceHistory.upsert({
      where: { productId_dateKey: { productId: product.id, dateKey: today } },
      update: { minPrice, maxPrice, avgPrice },
      create: { productId: product.id, dateKey: today, minPrice, maxPrice, avgPrice }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════════════
function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveUrl(baseUrl: string, path: string) {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    return path.startsWith('//') ? `https:${path}` : path;
  }
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function generateSlug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 200) || `product-${Date.now()}`;
}
