import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { prisma } from '../lib/prisma.js';

// ───── 카테고리 트리 정의 ─────
export const CATEGORY_TREE = [
  {
    key: '호구',
    label: '호구',
    subcategories: [
      '고급 수제호구', '일반 수제호구', '고급 기계식호구', '일반 기계식호구',
      '호면', '갑', '호완', '갑상', '명패', '호구 액세서리', '호구이름표'
    ]
  },
  {
    key: '죽도&목검',
    label: '죽도 & 목검',
    subcategories: [
      '일반죽도', '고급죽도', '시합용죽도', '여성용죽도', '알죽도',
      '일본산 알죽도', '특수죽도/훈련용죽도', '죽도소품',
      '목검', '가검', '좌대', '기타 소품', '무술/수련장비'
    ]
  },
  {
    key: '죽도집&가방류',
    label: '죽도집 & 가방류',
    subcategories: [
      '죽도집/목검집', '호구가방', '호구가방+죽도집 세트',
      '도복가방/손가방/호완가방', '심판기집', '면수건'
    ]
  },
  {
    key: '면수건',
    label: '면수건',
    subcategories: [
      '#일본산 이원염 면수건', '일본산 면수건', '고급 면수건', '모자 면수건', '#안보 면수건'
    ]
  },
  {
    key: '도복',
    label: '도복',
    subcategories: [
      '**여름준비**', '일반도복', '고급도복', '기능성도복',
      '상하의 세트', '상의', '하의', '도복소품'
    ]
  },
  {
    key: '보호대',
    label: '보호대',
    subcategories: [
      '턱땀받이', '손목,팔꿈치', '무릎', '발', '기타', '테이핑', '#잠스트'
    ]
  },
  {
    key: '코등이/받침',
    label: '코등이/받침',
    subcategories: ['죽도 코등이', '죽도 코등이받침', '목검 코등이']
  },
  {
    key: '액세서리',
    label: '일반 액세서리',
    subcategories: ['안경테', '탈취제', '장식용품', '도장용품', '기타소품']
  }
];

// ───── 쇼핑몰 시드 데이터 ─────
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

// ───── 범용 페이지 가져오기 (EUC-KR 지원) ─────
async function fetchPage(url: string, encoding: 'utf-8' | 'euc-kr' = 'euc-kr') {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (encoding === 'euc-kr') {
    return iconv.decode(Buffer.from(response.data), 'euc-kr');
  }

  return Buffer.from(response.data).toString('utf-8');
}

// ───── Cafe24 기반 쇼핑몰 스크래퍼 ─────
// kumdoshop, kumdomall, kumdoland 등은 Cafe24 기반으로 URL 구조가 유사
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

async function scrapeCafe24Shop(
  baseUrl: string,
  categoryUrls: Array<{ url: string; category: string; subcategory: string | null }>,
  encoding: 'utf-8' | 'euc-kr' = 'euc-kr'
): Promise<ScrapedProduct[]> {
  const allProducts: ScrapedProduct[] = [];

  for (const categoryConfig of categoryUrls) {
    try {
      const html = await fetchPage(categoryConfig.url, encoding);
      const $ = cheerio.load(html);

      // Cafe24 일반적인 상품 리스트 패턴
      $('.xans-product-listnormal li, ul.prdList li, .item_box, table.MK_product_list tr, .mun_box li, .item_photo_box').each((_, el) => {
        const $el = $(el);

        // 상품명
        const rawName = ($el.find('.name a, .name span, .prd_name a, .item_name a, .item_tit_box a, .pname a').first().text()
          ?? $el.find('a[href*="product_detail"]').first().text()
          ?? '').trim();
        const name = rawName.replace(/^상품명\s*:\s*/, '').trim();
        if (!name) return;
        // 가격
        const specText = $el.find('.spec, .mun, p.price, .xans-product-listitem-price').first().text() ?? '';
        const priceMatch = specText.match(/판매가\s*:\s*([\d,]+)/);
        const priceText = priceMatch ? priceMatch[1] : ($el.find('.price .sell span, .price .org_price, .sale_price, .price_org').first().text() ?? $el.find('.price').first().text() ?? '');
        const price = parsePrice(priceText);
        if (!price) return;

        // 정가
        const origPriceText = $el.find('.price .consumer, .price .org_price, .origin_price, .custom').first().text() ?? '';
        const originalPrice = parsePrice(origPriceText);

        // 이미지
        const imgSrc = $el.find('img').first().attr('src') ?? $el.find('img').first().attr('data-src') ?? null;
        const imageUrl = imgSrc ? resolveUrl(baseUrl, imgSrc) : null;

        // 상품 URL
        const href = $el.find('a[href*="product_detail"], a[href*="shopdetail"]').first().attr('href')
          ?? $el.find('a').first().attr('href')
          ?? '';
        const productUrl = href ? resolveUrl(baseUrl, href) : '';

        if (!productUrl) return;

        allProducts.push({
          name,
          price,
          originalPrice: originalPrice !== price ? originalPrice : null,
          imageUrl,
          productUrl,
          category: categoryConfig.category,
          subcategory: categoryConfig.subcategory,
          shippingFee: null
        });
      });
    } catch (error) {
      console.error(`[scrape] 카테고리 스크래핑 실패: ${categoryConfig.url}`, error instanceof Error ? error.message : error);
    }
  }

  return allProducts;
}

// ───── 개별 쇼핑몰별 카테고리 URL 매핑 ─────

function getKumdoshopUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  const base = 'http://www.kumdoshop.co.kr/shop/shopbrand.html';
  return [
    { url: `${base}?xcode=004&type=X`, category: '호구', subcategory: null },
    { url: `${base}?xcode=005&type=X`, category: '죽도&목검', subcategory: null },
    { url: `${base}?xcode=007&type=X`, category: '도복', subcategory: null },
    { url: `${base}?xcode=002&type=X`, category: '죽도집&가방류', subcategory: null },
    { url: `${base}?xcode=006&type=X`, category: '보호대', subcategory: null },
    { url: `${base}?xcode=014&type=Y`, category: '액세서리', subcategory: null },
  ];
}

function getKumdomallUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  const base = 'http://www.kumdomall.co.kr/shop/shopbrand.html';
  return [
    { url: `${base}?type=X&xcode=042`, category: '호구', subcategory: null },
    { url: `${base}?type=X&xcode=043`, category: '죽도&목검', subcategory: null },
    { url: `${base}?type=O&xcode=046`, category: '죽도집&가방류', subcategory: null },
    { url: `${base}?type=X&xcode=044`, category: '도복', subcategory: null },
    { url: `${base}?type=O&xcode=045`, category: '보호대', subcategory: null },
    { url: `${base}?type=O&xcode=049`, category: '액세서리', subcategory: null },
  ];
}

function getWoochangUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'https://woochangsports.net/category/%ED%98%B8%EA%B5%AC/25/', category: '호구', subcategory: null },
    { url: 'https://woochangsports.net/category/%EB%8F%84%EB%B3%B5/26/', category: '도복', subcategory: null },
    { url: 'https://woochangsports.net/category/%EC%A3%BD%EB%8F%84/27/', category: '죽도&목검', subcategory: null },
    { url: 'https://woochangsports.net/category/%EB%AA%A9%EA%B2%80%EA%B0%80%EA%B2%80/28/', category: '죽도&목검', subcategory: '목검' },
    { url: 'https://woochangsports.net/category/%EC%BD%94%EB%93%B1%EC%9D%B4%EB%B0%9B%EC%B9%A8/29/', category: '코등이/받침', subcategory: null },
    { url: 'https://woochangsports.net/category/%EA%B0%80%EB%B0%A9/30/', category: '죽도집&가방류', subcategory: null },
    { url: 'https://woochangsports.net/category/%EB%A9%B4%EC%88%98%EA%B1%B4/31/', category: '면수건', subcategory: null },
    { url: 'https://woochangsports.net/category/%EB%B3%B4%ED%98%B8%EB%8C%80/32/', category: '보호대', subcategory: null },
    { url: 'https://woochangsports.net/category/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/134/', category: '액세서리', subcategory: null },
  ];
}

function getKumdolandUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'https://www.kumdoland.com/product/list.html?cate_no=46', category: '호구', subcategory: null },
    { url: 'https://www.kumdoland.com/product/list.html?cate_no=47', category: '죽도&목검', subcategory: null },
    { url: 'https://www.kumdoland.com/product/list.html?cate_no=48', category: '도복', subcategory: null },
    { url: 'https://www.kumdoland.com/product/list.html?cate_no=49', category: '죽도집&가방류', subcategory: null },
    { url: 'https://www.kumdoland.com/product/list.html?cate_no=50', category: '보호대', subcategory: null },
  ];
}

function getSehyunUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=25', category: '호구', subcategory: null },
    { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=26', category: '죽도&목검', subcategory: null },
    { url: 'https://sehyun-kumdo.com/product/list.html?cate_no=27', category: '도복', subcategory: null },
  ];
}

function getIgumdobUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=01000000', category: '호구', subcategory: null },
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=02000000', category: '죽도&목검', subcategory: null },
    { url: 'http://www.igumdo.com/mall/m_mall_list.php?ps_ctid=03000000', category: '도복', subcategory: null },
  ];
}

function getDkumdoUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'https://dkumdo.kr/product/list.html?cate_no=42', category: '호구', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=43', category: '죽도&목검', subcategory: null },
    { url: 'https://dkumdo.kr/product/list.html?cate_no=44', category: '도복', subcategory: null },
  ];
}

function getKendomallComUrls(): Array<{ url: string; category: string; subcategory: string | null }> {
  return [
    { url: 'https://kendomall.com/product/list.html?cate_no=43', category: '호구', subcategory: null },
    { url: 'https://kendomall.com/product/list.html?cate_no=44', category: '죽도&목검', subcategory: null },
    { url: 'https://kendomall.com/product/list.html?cate_no=45', category: '도복', subcategory: null },
  ];
}

// ───── 스크래핑 실행 ─────

const SHOP_SCRAPER_CONFIG: Record<string, {
  getUrls: () => Array<{ url: string; category: string; subcategory: string | null }>;
  encoding: 'utf-8' | 'euc-kr';
}> = {
  kumdoshop: { getUrls: getKumdoshopUrls, encoding: 'euc-kr' },
  kumdomall: { getUrls: getKumdomallUrls, encoding: 'euc-kr' },
  woochangsports: { getUrls: getWoochangUrls, encoding: 'utf-8' },
  kumdoland: { getUrls: getKumdolandUrls, encoding: 'utf-8' },
  sehyun: { getUrls: getSehyunUrls, encoding: 'utf-8' },
  igumdo: { getUrls: getIgumdobUrls, encoding: 'euc-kr' },
  dkumdo: { getUrls: getDkumdoUrls, encoding: 'utf-8' },
  kendomall: { getUrls: getKendomallComUrls, encoding: 'utf-8' }
};

export async function runSingleShopScrape(shopKey: string) {
  const config = SHOP_SCRAPER_CONFIG[shopKey];
  if (!config) return { shopKey, error: 'unknown-shop', count: 0 };

  const shop = await prisma.kendoShop.findUnique({ where: { key: shopKey } });
  if (!shop) return { shopKey, error: 'shop-not-found', count: 0 };

  const urls = config.getUrls();
  const products = await scrapeCafe24Shop(shop.baseUrl, urls, config.encoding);

  let saved = 0;
  for (const item of products) {
    try {
      await upsertScrapedProduct(shop.id, item);
      saved++;
    } catch (error) {
      console.error(`[scrape] 상품 저장 실패: ${item.name}`, error instanceof Error ? error.message : error);
    }
  }

  return { shopKey, scraped: products.length, saved };
}

export async function runFullScrape() {
  const results: Array<{ shopKey: string; scraped?: number; saved?: number; error?: string }> = [];

  for (const shopKey of Object.keys(SHOP_SCRAPER_CONFIG)) {
    const result = await runSingleShopScrape(shopKey);
    results.push(result);
  }

  // 일일 가격 히스토리 스냅샷 생성
  await snapshotDailyPrices();

  return results;
}

async function upsertScrapedProduct(shopId: string, item: ScrapedProduct) {
  const slug = generateSlug(item.name);

  let product = await prisma.kendoProduct.findUnique({ where: { slug } });

  if (!product) {
    product = await prisma.kendoProduct.create({
      data: {
        name: item.name,
        slug,
        category: item.category,
        subcategory: item.subcategory,
        imageUrl: item.imageUrl
      }
    });
  } else {
    if (item.imageUrl && !product.imageUrl) {
      await prisma.kendoProduct.update({
        where: { id: product.id },
        data: { imageUrl: item.imageUrl }
      });
    }
  }

  await prisma.kendoProductPrice.upsert({
    where: { productId_shopId: { productId: product.id, shopId } },
    update: {
      price: item.price,
      originalPrice: item.originalPrice,
      shippingFee: item.shippingFee,
      productUrl: item.productUrl,
      inStock: true,
      lastScrapedAt: new Date()
    },
    create: {
      productId: product.id,
      shopId,
      price: item.price,
      originalPrice: item.originalPrice,
      shippingFee: item.shippingFee,
      productUrl: item.productUrl,
      inStock: true
    }
  });
}

async function snapshotDailyPrices() {
  const today = new Date().toISOString().slice(0, 10);

  const products = await prisma.kendoProduct.findMany({
    include: {
      prices: { select: { price: true } }
    }
  });

  for (const product of products) {
    if (product.prices.length === 0) continue;

    const priceValues = product.prices.map((p: { price: number }) => p.price);
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const avgPrice = Math.round(priceValues.reduce((sum: number, p: number) => sum + p, 0) / priceValues.length);

    await prisma.kendoPriceHistory.upsert({
      where: { productId_dateKey: { productId: product.id, dateKey: today } },
      update: { minPrice, maxPrice, avgPrice },
      create: { productId: product.id, dateKey: today, minPrice, maxPrice, avgPrice }
    });
  }
}

// ───── 유틸리티 ─────

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
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200) || `product-${Date.now()}`;
}
