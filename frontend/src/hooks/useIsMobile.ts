import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 820;

export function useIsMobile() {
  const getValue = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  };

  const [isMobile, setIsMobile] = useState(getValue);

  useEffect(() => {
    const handleResize = () => setIsMobile(getValue());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}