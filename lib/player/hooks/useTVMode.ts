"use client";
import { useState, useEffect } from 'react';

export function useTVMode() {
  const [isTV, setIsTV] = useState<boolean>(false);

  useEffect(() => {
    const checkTVMode = () => {
      // 1. URL Override (?mode=tv)
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'tv') return true;

      // 2. Heuristics
      const noTouch = navigator.maxTouchPoints === 0;
      const notFinePointer = !window.matchMedia('(pointer: fine)').matches;
      const largeViewport = window.innerWidth >= 1280 && window.innerHeight >= 720;
      
      // Often TVs identify as NOT having a fine pointer (mouse) and NOT having touch
      // Chromium kiosk on RPi usually follows this as well.
      return noTouch && (notFinePointer || largeViewport);
    };

    const isTvMode = checkTVMode();
    setIsTV(isTvMode);

    if (isTvMode) {
      document.documentElement.classList.add('tv-mode');
    } else {
      document.documentElement.classList.remove('tv-mode');
    }
  }, []);

  return isTV;
}
