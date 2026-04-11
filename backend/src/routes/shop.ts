import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireApprovedClubAccess } from '../auth/requireAuth.js';
import { sanitizeNullableString, sanitizeNullableInt } from '../lib/club.js';
import { runFullScrape, runSingleShopScrape, seedShops, CATEGORY_TREE } from '../services/shopScraper.js';

const router = Router();

router.get('/categories', requireApprovedClubAccess, (_req, res) => {
  res.json(CATEGORY_TREE);
});

router.get('/products', requireApprovedClubAccess, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 20;
    const query = sanitizeNullableString(req.query.query)?.trim() ?? null;
    const categoryQuery = sanitizeNullableString(req.query.categoryQuery)?.trim() ?? null;
    const category = sanitizeNullableString(req.query.category) ?? null;
    const subcategory = sanitizeNullableString(req.query.subcategory) ?? null;
    const minPrice = sanitizeNullableInt(req.query.minPrice);
    const maxPrice = sanitizeNullableInt(req.query.maxPrice);
    const sortBy = String(req.query.sortBy ?? 'price_asc');

    const andFilters: Array<Record<string, unknown>> = [];

    if (query) {
      andFilters.push({ name: { contains: query, mode: 'insensitive' } });
    }
    if (categoryQuery) {
      andFilters.push({ name: { contains: categoryQuery, mode: 'insensitive' } });
    }
    if (category) {
      andFilters.push({ category });
    }
    if (subcategory) {
      andFilters.push({ subcategory });
    }

    if (minPrice !== null || maxPrice !== null) {
      andFilters.push({
        prices: {
          some: {
            price: {
              ...(minPrice !== null ? { gte: minPrice } : {}),
              ...(maxPrice !== null ? { lte: maxPrice } : {})
            }
          }
        }
      });
    }

    const where = andFilters.length > 0 ? { AND: andFilters } : {};

    const orderBy: Array<Record<string, unknown>> = [];
    if (sortBy === 'price_desc') {
      orderBy.push({ prices: { _min: { price: 'desc' } } });
    } else if (sortBy === 'price_asc') {
      orderBy.push({ prices: { _min: { price: 'asc' } } });
    } else if (sortBy === 'name') {
      orderBy.push({ name: 'asc' });
    } else if (sortBy === 'newest') {
      orderBy.push({ createdAt: 'desc' });
    }
    orderBy.push({ updatedAt: 'desc' });

    const totalCount = await prisma.kendoProduct.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const products = await prisma.kendoProduct.findMany({
      where,
      include: {
        prices: {
          include: { shop: { select: { name: true, key: true } } },
          orderBy: { price: 'asc' }
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy
    });

    const items = products.map(serializeProductSummary);
    res.json({ currentPage: page, totalPages, totalCount, items });
  } catch (error) {
    next(error);
  }
});

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

function serializeProductSummary(product: {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  prices: Array<{
    price: number;
    originalPrice: number | null;
    shippingFee: number | null;
    shop: { name: string; key: string };
  }>;
}) {
  const displaySortedPrices = [...product.prices].sort((left, right) => {
    const leftPrice = left.price > 0 ? left.price : Number.MAX_SAFE_INTEGER;
    const rightPrice = right.price > 0 ? right.price : Number.MAX_SAFE_INTEGER;
    return leftPrice - rightPrice;
  });

  const lowestPrice = displaySortedPrices[0] ?? null;

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
    shopCount: product.prices.length
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
    shop: { id: string; key: string; name: string; baseUrl: string; logoUrl: string | null };
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
