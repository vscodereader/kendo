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

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<ShopProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(Number(params.get('page') ?? '1') || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [queryInput, setQueryInput] = useState(params.get('query') ?? '');
  const [appliedQuery, setAppliedQuery] = useState(params.get('query') ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.get('category'));
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(params.get('subcategory'));

  const [categoryQueryInput, setCategoryQueryInput] = useState(params.get('categoryQuery') ?? '');
  const [appliedCategoryQuery, setAppliedCategoryQuery] = useState(params.get('categoryQuery') ?? '');
  const [minPriceInput, setMinPriceInput] = useState(params.get('minPrice') ?? '');
  const [maxPriceInput, setMaxPriceInput] = useState(params.get('maxPrice') ?? '');
  const [sortBy, setSortBy] = useState(params.get('sortBy') ?? 'price_asc');

  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(null);

  useEffect(() => {
    void fetchShopCategories()
      .then(setCategories)
      .catch(() => pushToast('카테고리를 불러오지 못했습니다.', 'error'));
  }, [pushToast]);

  const loadProducts = useCallback(
    async (
      nextPage: number,
      nextQuery: string,
      nextCategory: string | null,
      nextSubcategory: string | null,
      nextCategoryQuery: string,
      nextMinPrice: string,
      nextMaxPrice: string,
      nextSortBy: string
    ) => {
      setLoading(true);
      try {
        const data = await fetchShopProducts({
          page: nextPage,
          query: nextQuery,
          category: nextCategory,
          subcategory: nextSubcategory,
          categoryQuery: nextCategoryQuery,
          minPrice: nextMinPrice,
          maxPrice: nextMaxPrice,
          sortBy: nextSortBy
        });

        const sortedItems = [...data.items];
        if (nextSortBy === 'price_asc') {
          sortedItems.sort((a, b) => {
            const left = a.lowestPrice && a.lowestPrice > 0 ? a.lowestPrice : Number.MAX_SAFE_INTEGER;
            const right = b.lowestPrice && b.lowestPrice > 0 ? b.lowestPrice : Number.MAX_SAFE_INTEGER;
            if (left !== right) return left - right;
            return a.name.localeCompare(b.name, 'ko');
          });
        }

        setProducts(sortedItems);
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
    if (appliedCategoryQuery) nextParams.set('categoryQuery', appliedCategoryQuery);
    if (minPriceInput.trim()) nextParams.set('minPrice', minPriceInput.trim());
    if (maxPriceInput.trim()) nextParams.set('maxPrice', maxPriceInput.trim());
    if (sortBy) nextParams.set('sortBy', sortBy);
    if (page > 1) nextParams.set('page', String(page));

    setParams(nextParams, { replace: true });
    void loadProducts(
      page,
      appliedQuery,
      selectedCategory,
      selectedSubcategory,
      appliedCategoryQuery,
      minPriceInput,
      maxPriceInput,
      sortBy
    );
  }, [
    page,
    appliedQuery,
    selectedCategory,
    selectedSubcategory,
    appliedCategoryQuery,
    minPriceInput,
    maxPriceInput,
    sortBy,
    loadProducts,
    setParams
  ]);

  const activeCategory = useMemo(
    () => categories.find((category) => category.key === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  const buildParams = useCallback(
    (overrides?: {
      category?: string | null;
      subcategory?: string | null;
      page?: number;
    }) => {
      const nextParams = new URLSearchParams();
      if (appliedQuery) nextParams.set('query', appliedQuery);
      const nextCategory = overrides?.category ?? selectedCategory;
      const nextSubcategory = overrides?.subcategory ?? selectedSubcategory;
      const nextPage = overrides?.page ?? page;
      if (nextCategory) nextParams.set('category', nextCategory);
      if (nextSubcategory) nextParams.set('subcategory', nextSubcategory);
      if (appliedCategoryQuery) nextParams.set('categoryQuery', appliedCategoryQuery);
      if (minPriceInput.trim()) nextParams.set('minPrice', minPriceInput.trim());
      if (maxPriceInput.trim()) nextParams.set('maxPrice', maxPriceInput.trim());
      if (sortBy) nextParams.set('sortBy', sortBy);
      if (nextPage > 1) nextParams.set('page', String(nextPage));
      return nextParams;
    },
    [appliedCategoryQuery, appliedQuery, maxPriceInput, minPriceInput, page, selectedCategory, selectedSubcategory, sortBy]
  );

  const handleSearch = (query?: string) => {
    const nextQuery = (query ?? queryInput).trim();
    if (nextQuery) addRecentSearch(nextQuery);
    setAppliedQuery(nextQuery);
    setPage(1);
    setRecentSearches(getRecentSearches());
    setSearchFocused(false);
    setMobileSearchOpen(false);
    const nextParams = buildParams({ page: 1 });
    if (nextQuery) nextParams.set('query', nextQuery);
    else nextParams.delete('query');
    setParams(nextParams, { replace: false });
  };

  const handleCategorySelect = (catKey: string | null, subKey: string | null) => {
    setSelectedCategory(catKey);
    setSelectedSubcategory(subKey);
    setPage(1);
    setMobileCategoryOpen(false);
    const nextParams = buildParams({ category: catKey, subcategory: subKey, page: 1 });
    setParams(nextParams, { replace: false });
  };

  const applyScopedFilters = () => {
    setAppliedCategoryQuery(categoryQueryInput.trim());
    setPage(1);
    setMobileFilterOpen(false);
  };

  const handleRecentClick = (term: string) => {
    setQueryInput(term);
    handleSearch(term);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  if (!isMobile) {
    return (
      <div className="shop-page shop-page--desktop">
        <div className="shop-search-bar">
          <div className="shop-search-bar__inner">
            <input
              ref={searchInputRef}
              className="shop-search-input"
              placeholder="검도 용품을 검색하세요"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onFocus={() => {
                setSearchFocused(true);
                setRecentSearches(getRecentSearches());
              }}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
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

        <div className="shop-category-bar shop-category-bar--centered">
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

        {activeCategory && (
          <div className="shop-subcategory-bar shop-subcategory-bar--centered">
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

        <div className="shop-scoped-filter-bar">
          <input
            className="shop-scoped-filter-input shop-scoped-filter-input--query"
            placeholder={selectedSubcategory ? `${selectedSubcategory} 안에서 검색` : selectedCategory ? `${activeCategory?.label ?? selectedCategory} 안에서 검색` : '현재 목록 안에서 검색'}
            value={categoryQueryInput}
            onChange={(event) => setCategoryQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyScopedFilters();
            }}
          />
          <input
            className="shop-scoped-filter-input shop-scoped-filter-input--price"
            inputMode="numeric"
            placeholder="최소금액"
            value={minPriceInput}
            onChange={(event) => setMinPriceInput(event.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyScopedFilters();
            }}
          />
          <span className="shop-scoped-filter-separator">~</span>
          <input
            className="shop-scoped-filter-input shop-scoped-filter-input--price"
            inputMode="numeric"
            placeholder="최대금액"
            value={maxPriceInput}
            onChange={(event) => setMaxPriceInput(event.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyScopedFilters();
            }}
          />
          <button type="button" className="shop-scoped-filter-btn" onClick={applyScopedFilters}>적용</button>
          <button
            type="button"
            className={`shop-scoped-filter-btn ${sortBy === 'price_asc' ? 'is-active' : ''}`}
            onClick={() => {
              setSortBy('price_asc');
              setPage(1);
            }}
          >
            낮은가격순
          </button>
        </div>

        <div className="shop-results-header">
          {appliedQuery && <span>'{appliedQuery}' 검색결과 {totalCount}건</span>}
          {!appliedQuery && selectedCategory && <span>{activeCategory?.label ?? selectedCategory} {totalCount}건</span>}
          {!appliedQuery && !selectedCategory && <span>전체 상품 {totalCount}건</span>}
        </div>

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

  return (
    <div className="shop-page shop-page--mobile">
      <div className="shop-mobile-search-trigger" onClick={() => setMobileSearchOpen(true)}>
        <span className="shop-mobile-search-icon">🔍</span>
        <span className="shop-mobile-search-placeholder">{appliedQuery || '검도 용품을 검색하세요'}</span>
      </div>

      <div className="shop-mobile-toolbar">
        <button
          type="button"
          className="shop-mobile-category-toggle"
          onClick={() => setMobileCategoryOpen(!mobileCategoryOpen)}
        >
          {selectedCategory ? (activeCategory?.label ?? selectedCategory) : '카테고리'}
          <span className="shop-mobile-category-arrow">{mobileCategoryOpen ? '▲' : '▼'}</span>
        </button>

        <button
          type="button"
          className="shop-mobile-filter-toggle"
          onClick={() => setMobileFilterOpen(true)}
        >
          필터
        </button>
      </div>

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

      <MobileFilterDrawer
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        queryInput={categoryQueryInput}
        onQueryChange={setCategoryQueryInput}
        minPriceInput={minPriceInput}
        maxPriceInput={maxPriceInput}
        onMinPriceChange={(value) => setMinPriceInput(value.replace(/[^0-9]/g, ''))}
        onMaxPriceChange={(value) => setMaxPriceInput(value.replace(/[^0-9]/g, ''))}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        onApply={applyScopedFilters}
      />
    </div>
  );
}

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

function MobileSearchDrawer({
  open,
  onClose,
  onSearch,
  queryInput,
  onQueryChange,
  recentSearches,
  onRecentClick,
  onClearRecent
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
      <button type="button" className={`shop-search-drawer-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`shop-search-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="shop-search-drawer__header">
          <button type="button" className="shop-search-drawer__back" onClick={onClose}>←</button>
          <input
            ref={inputRef}
            className="shop-search-drawer__input"
            placeholder="검색어 입력"
            value={queryInput}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearch();
            }}
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

function MobileFilterDrawer({
  open,
  onClose,
  queryInput,
  onQueryChange,
  minPriceInput,
  maxPriceInput,
  onMinPriceChange,
  onMaxPriceChange,
  sortBy,
  onSortByChange,
  onApply
}: {
  open: boolean;
  onClose: () => void;
  queryInput: string;
  onQueryChange: (value: string) => void;
  minPriceInput: string;
  maxPriceInput: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <>
      <button type="button" className={`shop-filter-drawer-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`shop-filter-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="shop-filter-drawer__header">
          <strong>필터</strong>
          <button type="button" className="shop-filter-drawer__close" onClick={onClose}>✕</button>
        </div>

        <div className="shop-filter-drawer__section">
          <div className="shop-filter-drawer__label">현재 카테고리 내 검색</div>
          <input
            className="shop-filter-drawer__input"
            placeholder="검색어 입력"
            value={queryInput}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

        <div className="shop-filter-drawer__section">
          <div className="shop-filter-drawer__label">가격대</div>
          <div className="shop-filter-drawer__price-row">
            <input
              className="shop-filter-drawer__input"
              inputMode="numeric"
              placeholder="최소금액"
              value={minPriceInput}
              onChange={(event) => onMinPriceChange(event.target.value)}
            />
            <span>~</span>
            <input
              className="shop-filter-drawer__input"
              inputMode="numeric"
              placeholder="최대금액"
              value={maxPriceInput}
              onChange={(event) => onMaxPriceChange(event.target.value)}
            />
          </div>
        </div>

        <div className="shop-filter-drawer__section">
          <div className="shop-filter-drawer__label">정렬</div>
          <button
            type="button"
            className={`shop-filter-drawer__sort-btn ${sortBy === 'price_asc' ? 'is-active' : ''}`}
            onClick={() => onSortByChange('price_asc')}
          >
            낮은 가격 순
          </button>
        </div>

        <button type="button" className="shop-filter-drawer__apply" onClick={onApply}>적용</button>
      </aside>
    </>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let current = start; current <= end; current += 1) pages.push(current);

  return (
    <div className="shop-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages.map((current) => (
        <button key={current} type="button" className={current === page ? 'is-active' : ''} onClick={() => onPageChange(current)}>
          {current}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
    </div>
  );
}

export default ShopPage;