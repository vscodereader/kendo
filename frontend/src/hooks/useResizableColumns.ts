import { useMemo, useState } from 'react';

export function useResizableColumns(initial: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(initial);

  const startResize = (key: string, clientX: number) => {
    const startWidth = widths[key] ?? 120;

    const handleMove = (event: MouseEvent) => {
      const next = Math.max(72, startWidth + (event.clientX - clientX));
      setWidths((current) => ({ ...current, [key]: next }));
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const colStyles = useMemo(
    () => Object.fromEntries(Object.entries(widths).map(([key, value]) => [key, { width: `${value}px` }])),
    [widths]
  );

  return { widths, colStyles, startResize };
}
