import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../lib/toast';
import {
  fetchPriceHistory,
  fetchShopProductDetail,
  formatKRW,
  type PriceHistoryPoint,
  type ShopProductDetail
} from '../lib/shop';

const PERIOD_OPTIONS = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '12개월', months: 12 },
  { label: '24개월', months: 24 }
];

function ShopProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const isMobile = useIsMobile();

  const [product, setProduct] = useState<ShopProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 가격 추이
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [pricePoints, setPricePoints] = useState<PriceHistoryPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<PriceHistoryPoint | null>(null);

  // ── Load product ──
  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    void fetchShopProductDetail(productId)
      .then(setProduct)
      .catch((err) => pushToast(err instanceof Error ? err.message : '상품 정보를 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
  }, [productId]);

  // ── Load price history ──
  useEffect(() => {
    if (!productId) return;
    setChartLoading(true);
    void fetchPriceHistory(productId, selectedPeriod)
      .then((data) => setPricePoints(data.points))
      .catch(() => setPricePoints([]))
      .finally(() => setChartLoading(false));
  }, [productId, selectedPeriod]);

  const lowestPrice = useMemo(() => {
    if (!product || product.prices.length === 0) return null;
    return product.prices[0];
  }, [product]);

  if (loading) {
    return <div className="shop-detail-loading">상품 정보를 불러오는 중...</div>;
  }

  if (!product) {
    return (
      <div className="shop-detail-empty">
        <p>상품을 찾을 수 없습니다.</p>
        <button type="button" className="primary-btn" onClick={() => navigate('/shop')}>목록으로</button>
      </div>
    );
  }

  return (
    <div className={`shop-detail-page ${isMobile ? 'shop-detail-page--mobile' : 'shop-detail-page--desktop'}`}>
      {/* 상단: 이미지 + 기본 정보 */}
      <div className="shop-detail-top">
        <div className="shop-detail-image">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} />
          ) : (
            <div className="shop-detail-noimg">이미지 없음</div>
          )}
        </div>

        <div className="shop-detail-info">
          <div className="shop-detail-category">{product.category}{product.subcategory ? ` > ${product.subcategory}` : ''}</div>
          <h1 className="shop-detail-name">{product.name}</h1>

          {/* 최저가 표시 */}
          <div className="shop-detail-lowest">
            <span className="shop-detail-lowest__label">최저가</span>
            <span className="shop-detail-lowest__price">
              {lowestPrice ? formatKRW(lowestPrice.price) : '정보 없음'}
            </span>
            {lowestPrice && (
              <a
                href={lowestPrice.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shop-detail-lowest__buy"
              >
                최저가 구매하기
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 쇼핑몰별 가격 비교 */}
      <div className="shop-detail-section">
        <h2>쇼핑몰별 최저가</h2>
        <div className="shop-price-table">
          <div className="shop-price-table__header">
            <span>쇼핑몰</span>
            <span>최저가</span>
            <span>배송비</span>
            <span></span>
          </div>
          {product.prices.map((entry) => (
            <div key={entry.id} className="shop-price-table__row">
              <span className="shop-price-table__shop">{entry.shopName}</span>
              <span className="shop-price-table__price">
                {entry.originalPrice && entry.originalPrice > entry.price && (
                  <span className="shop-price-table__orig">{formatKRW(entry.originalPrice)}</span>
                )}
                <strong>{formatKRW(entry.price)}</strong>
              </span>
              <span className="shop-price-table__shipping">
                {entry.shippingFee !== null && entry.shippingFee > 0 ? formatKRW(entry.shippingFee) : '-'}
              </span>
              <span>
                <a
                  href={entry.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shop-price-table__link"
                >
                  구매
                </a>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 최저가 추이 */}
      <div className="shop-detail-section">
        <h2>최저가 추이</h2>

        <div className="shop-chart-periods">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              type="button"
              className={`shop-chart-period-btn ${selectedPeriod === opt.months ? 'is-active' : ''}`}
              onClick={() => setSelectedPeriod(opt.months)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="shop-chart-container">
          {chartLoading ? (
            <div className="shop-chart-loading">로딩 중...</div>
          ) : pricePoints.length === 0 ? (
            <div className="shop-chart-empty">가격 추이 데이터가 없습니다.</div>
          ) : (
            <PriceTrendChart
              points={pricePoints}
              hoveredPoint={hoveredPoint}
              onHover={setHoveredPoint}
              onLeave={() => setHoveredPoint(null)}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      {/* 설명 */}
      {product.description && (
        <div className="shop-detail-section">
          <h2>상품 설명</h2>
          <div className="shop-detail-desc" dangerouslySetInnerHTML={{ __html: product.description }} />
        </div>
      )}
    </div>
  );
}

// ───── 가격 추이 SVG 차트 ─────
function PriceTrendChart({
  points,
  hoveredPoint,
  onHover,
  onLeave,
  isMobile
}: {
  points: PriceHistoryPoint[];
  hoveredPoint: PriceHistoryPoint | null;
  onHover: (p: PriceHistoryPoint) => void;
  onLeave: () => void;
  isMobile: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const W = isMobile ? 340 : 600;
  const H = isMobile ? 180 : 220;
  const PAD = { top: 30, right: 20, bottom: 40, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { minP, maxP, xScale, yScale } = useMemo(() => {
    const prices = points.map((p) => p.price);
    const mn = Math.min(...prices);
    const mx = Math.max(...prices);
    const range = mx - mn || 1000;

    return {
      minP: mn - range * 0.1,
      maxP: mx + range * 0.1,
      xScale: (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * plotW,
      yScale: (price: number) => PAD.top + plotH - ((price - (mn - range * 0.1)) / ((mx + range * 0.1) - (mn - range * 0.1))) * plotH
    };
  }, [points, W, H]);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(p.price).toFixed(1)}`).join(' ');

  const handlePointInteraction = (point: PriceHistoryPoint) => {
    if (hoveredPoint === point) {
      onLeave();
    } else {
      onHover(point);
    }
  };

  // x축 라벨: 처음, 중간, 마지막
  const xLabels = useMemo(() => {
    if (points.length === 0) return [];
    const labels: Array<{ x: number; text: string }> = [];
    const fmt = (d: string) => { const p = d.split('-'); return `${p[1]}.${p[2]}`; };

    labels.push({ x: xScale(0), text: fmt(points[0].date) });
    if (points.length > 2) {
      const mid = Math.floor(points.length / 2);
      labels.push({ x: xScale(mid), text: fmt(points[mid].date) });
    }
    labels.push({ x: xScale(points.length - 1), text: '현재' });
    return labels;
  }, [points, xScale]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="shop-price-chart-svg"
      onMouseLeave={onLeave}
      onTouchEnd={(e) => {
        // 모바일: 차트 바깥 터치 시 해제
        const target = e.target as Element;
        if (!target.closest('.shop-chart-point')) onLeave();
      }}
    >
      {/* 그리드 라인 */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PAD.top + plotH * (1 - ratio);
        const price = minP + (maxP - minP) * ratio;
        return (
          <g key={ratio}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--shop-chart-grid, #e5e7eb)" strokeWidth={0.5} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--shop-chart-label, #9ca3af)">
              {Math.round(price).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* x축 라벨 */}
      {xLabels.map((lbl, i) => (
        <text key={i} x={lbl.x} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--shop-chart-label, #9ca3af)">
          {lbl.text}
        </text>
      ))}

      {/* 선 */}
      <path d={pathD} fill="none" stroke="var(--shop-chart-line, #2563eb)" strokeWidth={2.5} strokeLinejoin="round" />

      {/* 점 */}
      {points.map((point, i) => {
        const cx = xScale(i);
        const cy = yScale(point.price);
        const isHovered = hoveredPoint === point;

        return (
          <g key={i} className="shop-chart-point">
            {/* 투명한 터치 영역 */}
            <circle
              cx={cx} cy={cy} r={isMobile ? 16 : 10}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(point)}
              onClick={() => handlePointInteraction(point)}
            />
            <circle
              cx={cx} cy={cy} r={isHovered ? 5 : 3.5}
              fill={isHovered ? 'var(--shop-chart-line, #2563eb)' : '#fff'}
              stroke="var(--shop-chart-line, #2563eb)"
              strokeWidth={2}
            />
            {isHovered && (
              <g>
                <rect
                  x={cx - 40} y={cy - 28} width={80} height={22} rx={6}
                  fill="var(--shop-chart-line, #2563eb)"
                />
                <text x={cx} y={cy - 13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
                  {formatKRW(point.price)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default ShopProductDetailPage;