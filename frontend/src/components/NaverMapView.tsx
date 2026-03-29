import { useEffect, useRef, useState } from 'react';

type Props = {
  placeName: string;
  address: string;
  mapLink: string;
};

let naverMapsLoader: Promise<any> | null = null;

function loadNaverMaps(keyId: string) {
  if ((window as any).naver?.maps) {
    return Promise.resolve((window as any).naver);
  }

  if (naverMapsLoader) return naverMapsLoader;

  naverMapsLoader = new Promise((resolve, reject) => {
    const callbackName = `__naverMapsInit_${Date.now()}`;

    (window as any)[callbackName] = () => {
      resolve((window as any).naver);
      delete (window as any)[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
      keyId
    )}&submodules=geocoder&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete (window as any)[callbackName];
      reject(new Error('네이버 지도 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });

  return naverMapsLoader;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function NaverMapView({ placeName, address, mapLink }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openMapLink = () => {
    if (!mapLink) return;

    if (isMobileDevice()) {
      window.open(mapLink, '_blank', 'noopener,noreferrer');
      return;
    }

    window.open(mapLink, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    let disposed = false;

    const keyId = import.meta.env.VITE_NAVER_MAPS_KEY_ID;

    if (!keyId) {
      setError('VITE_NAVER_MAPS_KEY_ID가 없어 지도를 표시할 수 없습니다.');
      return;
    }

    if (!address.trim()) {
      setError('주소가 없어 지도를 표시할 수 없습니다.');
      return;
    }

    loadNaverMaps(keyId)
      .then((naver) => {
        if (disposed || !mapRef.current) return;

        const drawMap = (lat: number, lng: number) => {
          const position = new naver.maps.LatLng(lat, lng);

          const map = new naver.maps.Map(mapRef.current, {
            center: position,
            zoom: 16,
            zoomControl: true,
            zoomControlOptions: {
              position: naver.maps.Position.TOP_RIGHT
            }
          });

          const marker = new naver.maps.Marker({
            position,
            map,
            title: placeName || address
          });

          const infoWindow = new naver.maps.InfoWindow({
            content: `
              <div style="padding:10px 12px; min-width:220px; font-size:13px; line-height:1.5;">
                <strong>${escapeHtml(placeName || '위치')}</strong>
                <div style="margin-top:4px;">${escapeHtml(address)}</div>
              </div>
            `
          });

          infoWindow.open(map, marker);

          naver.maps.Event.addListener(marker, 'click', () => {
            infoWindow.open(map, marker);
          });

          if (!isMobileDevice()) {
            naver.maps.Event.addListener(map, 'dblclick', () => {
              if (mapLink) {
                window.open(mapLink, '_blank', 'noopener,noreferrer');
              }
            });
          }

          setError(null);
        };

        if (naver.maps.Service) {
          naver.maps.Service.geocode(
            {
              query: address
            },
            (status: string, response: any) => {
              if (disposed) return;

              if (status !== naver.maps.Service.Status.OK) {
                setError('주소를 좌표로 변환하지 못했습니다.');
                return;
              }

              const item = response?.v2?.addresses?.[0];
              if (!item) {
                setError('지도에 표시할 좌표를 찾지 못했습니다.');
                return;
              }

              drawMap(Number(item.y), Number(item.x));
            }
          );
        } else {
          setError('Geocoding 모듈이 로드되지 않았습니다.');
        }
      })
      .catch((err) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '지도를 불러오지 못했습니다.');
      });

    return () => {
      disposed = true;
    };
  }, [placeName, address, mapLink]);

  return (
    <div className="embedded-map-wrap">
      {error ? (
        <div className="embedded-map-error">{error}</div>
      ) : (
        <>
          <div ref={mapRef} className="embedded-map-canvas" />
          {mapLink ? (
            <div className="embedded-map-actions">
              <button type="button" className="ghost-btn" onClick={openMapLink}>
                네이버 지도 열기
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default NaverMapView;