import { API_BASE, apiFetch } from './auth';

// ───── Types ─────

export type CategoryNode = {
  key: string;
  label: string;
  subcategories: string[];
};

export type ShopProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  originalPrice: number | null;
  shippingFee: number | null;
  shopName: string | null;
  shopCount: number;
};

export type ShopPriceEntry = {
  id: string;
  price: number;
  originalPrice: number | null;
  shippingFee: number | null;
  productUrl: string;
  inStock: boolean;
  lastScrapedAt: string;
  shopKey: string;
  shopName: string;
  shopBaseUrl: string;
  shopLogoUrl: string | null;
};

export type PriceHistoryPoint = {
  date: string;
  price: number;
};

export type ShopProductDetail = {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  description: string | null;
  specifications: Record<string, string> | null;
  prices: ShopPriceEntry[];
  priceHistory: Array<{ date: string; minPrice: number; maxPrice: number | null; avgPrice: number | null }>;
};

export type ShopProductListResponse = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  items: ShopProductSummary[];
};

// ───── API ─────

async function shopRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? '요청에 실패했습니다.');
  }

  return (await response.json()) as T;
}

export async function fetchShopCategories() {
  return shopRequest<CategoryNode[]>('/club/shop/categories');
}

export async function fetchShopProducts(params: {
  page?: number;
  query?: string;
  category?: string | null;
  subcategory?: string | null;
  sortBy?: string;
}) {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  if (params.query?.trim()) search.set('query', params.query.trim());
  if (params.category) search.set('category', params.category);
  if (params.subcategory) search.set('subcategory', params.subcategory);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  return shopRequest<ShopProductListResponse>(`/club/shop/products?${search.toString()}`);
}

export async function fetchShopProductDetail(productId: string) {
  return shopRequest<ShopProductDetail>(`/club/shop/products/${productId}`);
}

export async function fetchPriceHistory(productId: string, months: number) {
  return shopRequest<{ months: number; points: PriceHistoryPoint[] }>(
    `/club/shop/products/${productId}/price-history?months=${months}`
  );
}

export function formatKRW(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('ko-KR').format(value) + '원';
}

// ───── 최근 검색어 (localStorage) ─────

const RECENT_SEARCH_KEY = 'kendo_shop_recent_searches';
const MAX_RECENT = 10;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const current = getRecentSearches().filter((item) => item !== trimmed);
  current.unshift(trimmed);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(current.slice(0, MAX_RECENT)));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCH_KEY);
}
