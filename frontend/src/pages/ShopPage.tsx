import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../lib/toast';
import {
  addRecentSearch,
  clearRecentSearches,
  fetchShopCategories,
  fetchShopProducts,
  formatKRW,
  getRecentSearches,
  type CategoryNode,
  type ShopProductSummary
} from '../lib/shop';

function ShopPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pushToast } = useToast();
  const isMobile = useIsMobile();

  // ── State ──
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<ShopProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [queryInput, setQueryInput] = useState(params.get('query') ?? '');
  const [appliedQuery, setAppliedQuery] = useState(params.get('query') ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.get('category'));
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(params.get('subcategory'));

  // Desktop: 검색창 포커스 시 최근 검색어
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Mobile: 검색 드로어
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Mobile: 카테고리 메뉴
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(null);

  // ── Load categories ──
  useEffect(() => {
    void fetchShopCategories()
      .then(setCategories)
      .catch(() => pushToast('카테고리를 불러오지 못했습니다.', 'error'));
  }, []);

  // ── Load products ──
  const loadProducts = useCallback(
    async (p: number, query: string, category: string | null, subcategory: string | null) => {
      setLoading(true);
      try {
        const data = await fetchShopProducts({ page: p, query, category, subcategory, sortBy: 'price_asc' });
        setProducts(data.items);
        setPage(data.currentPage);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '상품 목록을 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (appliedQuery) nextParams.set('query', appliedQuery);
    if (selectedCategory) nextParams.set('category', selectedCategory);
    if (selectedSubcategory) nextParams.set('subcategory', selectedSubcategory);
    if (page > 1) nextParams.set('page', String(page));
    setParams(nextParams, { replace: true });
    void loadProducts(page, appliedQuery, selectedCategory, selectedSubcategory);
  }, [page, appliedQuery, selectedCategory, selectedSubcategory]);

  // ── Handlers ──
  const handleSearch = (query?: string) => {
    const q = (query ?? queryInput).trim();
    if (q) addRecentSearch(q);
    setAppliedQuery(q);
    setPage(1);
    setRecentSearches(getRecentSearches());
    setSearchFocused(false);
    setMobileSearchOpen(false);

    const nextParams = new URLSearchParams();
    if (q) nextParams.set('query', q);
    if (selectedCategory) nextParams.set('category', selectedCategory);
    setParams(nextParams, { replace: true });
  };

  const handleCategorySelect = (catKey: string | null, subKey: string | null) => {
    setSelectedCategory(catKey);
    setSelectedSubcategory(subKey);
    setPage(1);
    setMobileCategoryOpen(false);
  };

  const handleRecentClick = (term: string) => {
    setQueryInput(term);
    handleSearch(term);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  // ── Active subcategories for selected category ──
  const activeCategory = useMemo(
    () => categories.find((c) => c.key === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  // ────────────────── DESKTOP ──────────────────
  if (!isMobile) {
    return (
      <div className="shop-page shop-page--desktop">
        {/* 검색 바 */}
        <div className="shop-search-bar">
          <div className="shop-search-bar__inner">
            <input
              ref={searchInputRef}
              className="shop-search-input"
              placeholder="검도 용품을 검색하세요"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onFocus={() => { setSearchFocused(true); setRecentSearches(getRecentSearches()); }}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
            <button className="shop-search-btn" onClick={() => handleSearch()}>검색</button>

            {searchFocused && recentSearches.length > 0 && (
              <div className="shop-recent-dropdown">
                <div className="shop-recent-dropdown__header">
                  <span>최근 검색어</span>
                  <button type="button" onClick={handleClearRecent}>전체삭제</button>
                </div>
                {recentSearches.map((term) => (
                  <button key={term} type="button" className="shop-recent-item" onMouseDown={() => handleRecentClick(term)}>
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="shop-category-bar">
          <button
            type="button"
            className={`shop-category-tab ${!selectedCategory ? 'is-active' : ''}`}
            onClick={() => handleCategorySelect(null, null)}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`shop-category-tab ${selectedCategory === cat.key ? 'is-active' : ''}`}
              onClick={() => handleCategorySelect(cat.key, null)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 서브카테고리 */}
        {activeCategory && (
          <div className="shop-subcategory-bar">
            <button
              type="button"
              className={`shop-subcategory-chip ${!selectedSubcategory ? 'is-active' : ''}`}
              onClick={() => handleCategorySelect(selectedCategory, null)}
            >
              전체
            </button>
            {activeCategory.subcategories.map((sub) => (
              <button
                key={sub}
                type="button"
                className={`shop-subcategory-chip ${selectedSubcategory === sub ? 'is-active' : ''}`}
                onClick={() => handleCategorySelect(selectedCategory, sub)}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* 결과 헤더 */}
        <div className="shop-results-header">
          {appliedQuery && <span>'{appliedQuery}' 검색결과 {totalCount}건</span>}
          {!appliedQuery && selectedCategory && <span>{activeCategory?.label ?? selectedCategory} {totalCount}건</span>}
          {!appliedQuery && !selectedCategory && <span>전체 상품 {totalCount}건</span>}
        </div>

        {/* 상품 그리드 (데스크톱: 좌측 필터 + 우측 그리드) */}
        <div className="shop-desktop-layout">
          <div className="shop-desktop-sidebar">
            <h3>카테고리</h3>
            {categories.map((cat) => (
              <div key={cat.key} className="shop-sidebar-group">
                <button
                  type="button"
                  className={`shop-sidebar-cat ${selectedCategory === cat.key ? 'is-active' : ''}`}
                  onClick={() => handleCategorySelect(cat.key, null)}
                >
                  {cat.label}
                </button>
                {selectedCategory === cat.key && (
                  <div className="shop-sidebar-subs">
                    {cat.subcategories.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        className={`shop-sidebar-sub ${selectedSubcategory === sub ? 'is-active' : ''}`}
                        onClick={() => handleCategorySelect(cat.key, sub)}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="shop-desktop-products">
            {loading ? (
              <div className="shop-loading">상품을 불러오는 중...</div>
            ) : products.length === 0 ? (
              <div className="shop-empty">검색 결과가 없습니다.</div>
            ) : (
              <>
                <div className="shop-product-grid shop-product-grid--desktop">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} onClick={() => navigate(`/shop/${product.id}`)} />
                  ))}
                </div>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ────────────────── MOBILE ──────────────────
  return (
    <div className="shop-page shop-page--mobile">
      {/* 검색 바 */}
      <div className="shop-mobile-search-trigger" onClick={() => setMobileSearchOpen(true)}>
        <span className="shop-mobile-search-icon">🔍</span>
        <span className="shop-mobile-search-placeholder">
          {appliedQuery || '검도 용품을 검색하세요'}
        </span>
      </div>

      {/* 카테고리 버튼 */}
      <button
        type="button"
        className="shop-mobile-category-toggle"
        onClick={() => setMobileCategoryOpen(!mobileCategoryOpen)}
      >
        {selectedCategory ? (activeCategory?.label ?? selectedCategory) : '카테고리'}
        <span className="shop-mobile-category-arrow">{mobileCategoryOpen ? '▲' : '▼'}</span>
      </button>

      {/* 카테고리 드롭다운 */}
      {mobileCategoryOpen && (
        <div className="shop-mobile-category-panel">
          <button
            type="button"
            className={`shop-mobile-cat-btn ${!selectedCategory ? 'is-active' : ''}`}
            onClick={() => handleCategorySelect(null, null)}
          >
            전체
          </button>
          {categories.map((cat) => (
            <div key={cat.key}>
              <button
                type="button"
                className={`shop-mobile-cat-btn ${selectedCategory === cat.key ? 'is-active' : ''}`}
                onClick={() => {
                  if (expandedCategoryKey === cat.key) {
                    setExpandedCategoryKey(null);
                  } else {
                    setExpandedCategoryKey(cat.key);
                    handleCategorySelect(cat.key, null);
                  }
                }}
              >
                {cat.label}
                <span className="shop-mobile-cat-arrow">{expandedCategoryKey === cat.key ? '▲' : '▼'}</span>
              </button>
              {expandedCategoryKey === cat.key && (
                <div className="shop-mobile-sub-list">
                  {cat.subcategories.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      className={`shop-mobile-sub-btn ${selectedSubcategory === sub ? 'is-active' : ''}`}
                      onClick={() => handleCategorySelect(cat.key, sub)}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 상품 목록 (모바일: 리스트형) */}
      <div className="shop-mobile-results">
        {loading ? (
          <div className="shop-loading">상품을 불러오는 중...</div>
        ) : products.length === 0 ? (
          <div className="shop-empty">검색 결과가 없습니다.</div>
        ) : (
          <>
            <div className="shop-product-list--mobile">
              {products.map((product) => (
                <MobileProductCard key={product.id} product={product} onClick={() => navigate(`/shop/${product.id}`)} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* 모바일 검색 드로어 */}
      <MobileSearchDrawer
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        onSearch={handleSearch}
        queryInput={queryInput}
        onQueryChange={setQueryInput}
        recentSearches={recentSearches}
        onRecentClick={handleRecentClick}
        onClearRecent={handleClearRecent}
      />
    </div>
  );
}

// ───── 데스크톱 상품 카드 ─────
function ProductCard({ product, onClick }: { product: ShopProductSummary; onClick: () => void }) {
  return (
    <button type="button" className="shop-product-card" onClick={onClick}>
      <div className="shop-product-card__img">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="shop-product-card__noimg">이미지 없음</div>
        )}
      </div>
      <div className="shop-product-card__info">
        <div className="shop-product-card__name">{product.name}</div>
        {product.originalPrice && product.originalPrice > (product.lowestPrice ?? 0) && (
          <div className="shop-product-card__orig">{formatKRW(product.originalPrice)}</div>
        )}
        <div className="shop-product-card__price">
          {product.lowestPrice && product.lowestPrice > 0 ? formatKRW(product.lowestPrice) : '가격문의'}
        </div>
        {product.shippingFee !== null && product.shippingFee > 0 && (
          <div className="shop-product-card__shipping">배송비 {formatKRW(product.shippingFee)}</div>
        )}
        <div className="shop-product-card__shop">
          {product.shopName && <span>{product.shopName}</span>}
          {product.shopCount > 1 && <span className="shop-product-card__count">외 {product.shopCount - 1}곳</span>}
        </div>
      </div>
    </button>
  );
}

// ───── 모바일 상품 카드 ─────
function MobileProductCard({ product, onClick }: { product: ShopProductSummary; onClick: () => void }) {
  return (
    <button type="button" className="shop-mobile-product-card" onClick={onClick}>
      <div className="shop-mobile-product-card__img">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="shop-mobile-product-card__noimg">이미지 없음</div>
        )}
      </div>
      <div className="shop-mobile-product-card__info">
        <div className="shop-mobile-product-card__name">{product.name}</div>
        {product.originalPrice && product.originalPrice > (product.lowestPrice ?? 0) && (
          <div className="shop-mobile-product-card__orig">{formatKRW(product.originalPrice)}</div>
        )}
        <div className="shop-mobile-product-card__price">
          {product.lowestPrice && product.lowestPrice > 0 ? formatKRW(product.lowestPrice) : '가격문의'}
        </div>
        {product.shippingFee !== null && product.shippingFee > 0 && (
          <div className="shop-mobile-product-card__shipping">배송비 {formatKRW(product.shippingFee)}</div>
        )}
        <div className="shop-mobile-product-card__shop">
          {product.shopName ?? ''}
          {product.shopCount > 1 && ` 외 ${product.shopCount - 1}곳`}
        </div>
      </div>
    </button>
  );
}

// ───── 모바일 검색 드로어 ─────
function MobileSearchDrawer({
  open, onClose, onSearch, queryInput, onQueryChange, recentSearches, onRecentClick, onClearRecent
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (q?: string) => void;
  queryInput: string;
  onQueryChange: (v: string) => void;
  recentSearches: string[];
  onRecentClick: (t: string) => void;
  onClearRecent: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`shop-search-drawer-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`shop-search-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="shop-search-drawer__header">
          <button type="button" className="shop-search-drawer__back" onClick={onClose}>←</button>
          <input
            ref={inputRef}
            className="shop-search-drawer__input"
            placeholder="검색어 입력"
            value={queryInput}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          />
          <button type="button" className="shop-search-drawer__submit" onClick={() => onSearch()}>🔍</button>
        </div>

        <div className="shop-search-drawer__body">
          {recentSearches.length > 0 && (
            <div className="shop-search-drawer__recent">
              <div className="shop-search-drawer__recent-header">
                <span>최근 검색어</span>
                <button type="button" onClick={onClearRecent}>전체삭제</button>
              </div>
              <div className="shop-search-drawer__recent-chips">
                {recentSearches.map((term) => (
                  <button key={term} type="button" className="shop-recent-chip" onClick={() => onRecentClick(term)}>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ───── 페이지네이션 ─────
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="shop-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages.map((p) => (
        <button key={p} type="button" className={p === page ? 'is-active' : ''} onClick={() => onPageChange(p)}>
          {p}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
    </div>
  );
}

export default ShopPage;