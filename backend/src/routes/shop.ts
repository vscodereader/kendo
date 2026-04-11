import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireApprovedClubAccess } from '../auth/requireAuth.js';
import { sanitizeNullableString, sanitizeNullableInt } from '../lib/club.js';
import { runFullScrape, runSingleShopScrape, seedShops, CATEGORY_TREE } from '../services/shopScraper.js';

const router = Router();

// ───── 카테고리 트리 ─────
router.get('/categories', requireApprovedClubAccess, (_req, res) => {
  res.json(CATEGORY_TREE);
});

// ───── 상품 검색 / 목록 ─────
router.get('/products', requireApprovedClubAccess, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 20;

    const query = sanitizeNullableString(req.query.query)?.trim() ?? null;
    const category = sanitizeNullableString(req.query.category) ?? null;
    const subcategory = sanitizeNullableString(req.query.subcategory) ?? null;
    const categoryQuery = sanitizeNullableString(req.query.categoryQuery)?.trim() ?? null;
    const minPrice = sanitizeNullableInt(req.query.minPrice);
    const maxPrice = sanitizeNullableInt(req.query.maxPrice);
    const sortBy = String(req.query.sortBy ?? 'price_asc');

    const where: Record<string, unknown> = {};

    if (query) {
      where.name = { contains: query, mode: 'insensitive' as const };
    }
    if (category) {
      where.category = category;
    }
    if (subcategory) {
      where.subcategory = subcategory;
    }

    const products = await prisma.kendoProduct.findMany({
      where,
      include: {
        prices: {
          include: {
            shop: {
              select: {
                name: true,
                key: true
              }
            }
          },
          orderBy: [{ price: 'asc' }, { createdAt: 'asc' }]
        }
      },
      orderBy: [{ updatedAt: 'desc' }]
    });

    let items = products.map((product) => serializeProductSummary(product));

    if (categoryQuery) {
      const q = categoryQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }

    if (minPrice !== null || maxPrice !== null) {
      items = items.filter((item) => {
        const price = item.lowestPrice;
        if (price === null || price <= 0) return false;
        if (minPrice !== null && price < minPrice) return false;
        if (maxPrice !== null && price > maxPrice) return false;
        return true;
      });
    }

    items.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'ko');
      }

      if (sortBy === 'newest') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }

      if (sortBy === 'price_desc') {
        const aPrice = a.lowestPrice && a.lowestPrice > 0 ? a.lowestPrice : -1;
        const bPrice = b.lowestPrice && b.lowestPrice > 0 ? b.lowestPrice : -1;
        if (aPrice !== bPrice) return bPrice - aPrice;
        return a.name.localeCompare(b.name, 'ko');
      }

      // 기본: 낮은 가격 순
      const aPrice = a.lowestPrice && a.lowestPrice > 0 ? a.lowestPrice : Number.MAX_SAFE_INTEGER;
      const bPrice = b.lowestPrice && b.lowestPrice > 0 ? b.lowestPrice : Number.MAX_SAFE_INTEGER;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return a.name.localeCompare(b.name, 'ko');
    });

    const totalCount = items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pagedItems = items.slice(startIndex, startIndex + pageSize).map(stripSummaryMeta);

    res.json({
      currentPage,
      totalPages,
      totalCount,
      items: pagedItems
    });
  } catch (error) {
    next(error);
  }
});

// ───── 상품 상세 ─────
router.get('/products/:productId', requireApprovedClubAccess, async (req, res, next) => {
  try {
    const product = await prisma.kendoProduct.findUnique({
      where: { id: String(req.params.productId) },
      include: {
        prices: {
          include: { shop: true },
          orderBy: { price: 'asc' }
        },
        priceHistory: {
          orderBy: { dateKey: 'asc' }
        }
      }
    });

    if (!product) {
      res.status(404).json({ message: '상품을 찾을 수 없습니다.' });
      return;
    }

    res.json(serializeProductDetail(product));
  } catch (error) {
    next(error);
  }
});

// ───── 가격 추이 ─────
router.get('/products/:productId/price-history', requireApprovedClubAccess, async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 1));
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceKey = since.toISOString().slice(0, 10);

    const history = await prisma.kendoPriceHistory.findMany({
      where: {
        productId: String(req.params.productId),
        dateKey: { gte: sinceKey }
      },
      orderBy: { dateKey: 'asc' }
    });

    const weeklyPoints = aggregateWeekly(history);
    res.json({ months, points: weeklyPoints });
  } catch (error) {
    next(error);
  }
});

// ───── 쇼핑몰 목록 ─────
router.get('/shops', requireApprovedClubAccess, async (_req, res, next) => {
  try {
    const shops = await prisma.kendoShop.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    res.json(shops);
  } catch (error) {
    next(error);
  }
});

// ───── 관리자: 스크래핑 실행 ─────
router.post('/admin/scrape', async (req, res, next) => {
  try {
    const secret = req.header('X-Approval-Reminder-Secret')?.trim();
    const envSecret = process.env.APPROVAL_REMINDER_SECRET?.trim();

    if (!envSecret || secret !== envSecret) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const shopKey = sanitizeNullableString(req.body?.shopKey);

    if (shopKey) {
      const result = await runSingleShopScrape(shopKey);
      res.json({ ok: true, result });
    } else {
      const result = await runFullScrape();
      res.json({ ok: true, result });
    }
  } catch (error) {
    next(error);
  }
});

// ───── 관리자: 초기 쇼핑몰 시드 ─────
router.post('/admin/seed-shops', async (req, res, next) => {
  try {
    const secret = req.header('X-Approval-Reminder-Secret')?.trim();
    const envSecret = process.env.APPROVAL_REMINDER_SECRET?.trim();

    if (!envSecret || secret !== envSecret) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    await seedShops();
    const shops = await prisma.kendoShop.findMany({ orderBy: { name: 'asc' } });

    res.json({ ok: true, count: shops.length, shops });
  } catch (error) {
    next(error);
  }
});

// ───── Serializers ─────
function serializeProductSummary(product: {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  prices: Array<{
    price: number;
    originalPrice: number | null;
    shippingFee: number | null;
    shop: { name: string; key: string };
  }>;
}) {
  const validPrices = product.prices
    .filter((p) => typeof p.price === 'number' && p.price > 0)
    .sort((a, b) => a.price - b.price);

  const lowestPrice = validPrices[0] ?? null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    subcategory: product.subcategory,
    imageUrl: product.imageUrl,
    lowestPrice: lowestPrice?.price ?? null,
    originalPrice: lowestPrice?.originalPrice ?? null,
    shippingFee: lowestPrice?.shippingFee ?? null,
    shopName: lowestPrice?.shop.name ?? null,
    shopCount: product.prices.length,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

function stripSummaryMeta(item: ReturnType<typeof serializeProductSummary>) {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    category: item.category,
    subcategory: item.subcategory,
    imageUrl: item.imageUrl,
    lowestPrice: item.lowestPrice,
    originalPrice: item.originalPrice,
    shippingFee: item.shippingFee,
    shopName: item.shopName,
    shopCount: item.shopCount
  };
}

function serializeProductDetail(product: {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  description: string | null;
  specifications: string | null;
  prices: Array<{
    id: string;
    price: number;
    originalPrice: number | null;
    shippingFee: number | null;
    productUrl: string;
    inStock: boolean;
    lastScrapedAt: Date;
    shop: {
      id: string;
      key: string;
      name: string;
      baseUrl: string;
      logoUrl: string | null;
    };
  }>;
  priceHistory: Array<{
    dateKey: string;
    minPrice: number;
    maxPrice: number | null;
    avgPrice: number | null;
  }>;
}) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    subcategory: product.subcategory,
    imageUrl: product.imageUrl,
    description: product.description,
    specifications: product.specifications ? safeJsonParse(product.specifications) : null,
    prices: product.prices.map((p) => ({
      id: p.id,
      price: p.price,
      originalPrice: p.originalPrice,
      shippingFee: p.shippingFee,
      productUrl: p.productUrl,
      inStock: p.inStock,
      lastScrapedAt: p.lastScrapedAt,
      shopKey: p.shop.key,
      shopName: p.shop.name,
      shopBaseUrl: p.shop.baseUrl,
      shopLogoUrl: p.shop.logoUrl
    })),
    priceHistory: product.priceHistory.map((h) => ({
      date: h.dateKey,
      minPrice: h.minPrice,
      maxPrice: h.maxPrice,
      avgPrice: h.avgPrice
    }))
  };
}

function aggregateWeekly(history: Array<{ dateKey: string; minPrice: number }>) {
  if (history.length === 0) return [];

  const points: Array<{ date: string; price: number }> = [];
  let weekStart: string | null = null;
  let weekMin = Infinity;

  for (const entry of history) {
    const entryDate = new Date(entry.dateKey);
    const weekKey = getWeekStart(entryDate);

    if (weekStart !== weekKey) {
      if (weekStart && Number.isFinite(weekMin)) {
        points.push({ date: weekStart, price: weekMin });
      }
      weekStart = weekKey;
      weekMin = entry.minPrice;
    } else {
      weekMin = Math.min(weekMin, entry.minPrice);
    }
  }

  if (weekStart && Number.isFinite(weekMin)) {
    points.push({ date: weekStart, price: weekMin });
  }

  return points;
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default router;