import { useMemo } from 'react';
import NaverMapView from './NaverMapView';

type Props = {
  html: string;
};

type Segment =
  | { type: 'html'; html: string }
  | { type: 'map'; place: string; address: string; link: string };

const MAP_TOKEN_REGEX = /\[\[NAVER_MAP::(.*?)::(.*?)::(.*?)\]\]/g;

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitHtmlWithMapTokens(html: string): Segment[] {
  const result: Segment[] = [];
  let lastIndex = 0;

  for (const match of html.matchAll(MAP_TOKEN_REGEX)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      const before = html.slice(lastIndex, index);
      if (before.trim()) {
        result.push({ type: 'html', html: before });
      }
    }

    result.push({
      type: 'map',
      place: decode(match[1] ?? ''),
      address: decode(match[2] ?? ''),
      link: decode(match[3] ?? '')
    });

    lastIndex = index + match[0].length;
  }

  const tail = html.slice(lastIndex);
  if (tail.trim()) {
    result.push({ type: 'html', html: tail });
  }

  return result;
}

function BoardContentRenderer({ html }: Props) {
  const segments = useMemo(() => splitHtmlWithMapTokens(html || ''), [html]);

  return (
    <div className="board-content-renderer">
      {segments.map((segment, index) =>
        segment.type === 'html' ? (
          <div
            key={`html-${index}`}
            className="board-html-chunk"
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        ) : (
          <div key={`map-${index}`} className="board-map-chunk">
            <NaverMapView placeName={segment.place} address={segment.address} mapLink={segment.link} />
          </div>
        )
      )}
    </div>
  );
}

export default BoardContentRenderer;