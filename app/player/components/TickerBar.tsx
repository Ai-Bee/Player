"use client";
import React, { useEffect, useRef } from 'react';
import { TickerConfig, TickerContent } from '../../../lib/player/types';

interface TickerBarProps {
  config?: TickerConfig;
  content?: TickerContent;
}

// Basic marquee implementation using requestAnimationFrame.
export const TickerBar: React.FC<TickerBarProps> = ({ config, content }) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!config?.enabled) return;
    const speed = config.speed || 60; // px/sec
    const step = () => {
      const el = innerRef.current;
      if (!el) return;
      posRef.current -= speed / 60; // assume ~60fps; adjust with timestamp if desired
      const width = el.scrollWidth;
      if (-posRef.current > width) {
        posRef.current = 0;
      }
      el.style.transform = `translateX(${posRef.current}px)`;
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [config?.enabled, config?.speed, content?.text, content?.html]);

  if (!config?.enabled) return null;

  const theme = config.theme || {};
  const style: React.CSSProperties = {
    background: theme.bg || '#111',
    color: theme.color || '#fff',
    fontFamily: theme.fontFamily || 'sans-serif',
    fontSize: theme.fontSize || '14px',
  };

  return (
    <div className={`absolute left-0 right-0 ${config.position === 'top' ? 'top-0' : 'bottom-0'} h-10 overflow-hidden`} style={style}>
      <div className="whitespace-nowrap will-change-transform" ref={innerRef}>
        {content?.html ? (
          <span dangerouslySetInnerHTML={{ __html: content.html }} />
        ) : (
          <span>{content?.text}</span>
        )}
        <span className="mx-8">•</span>
        {content?.html ? (
          <span dangerouslySetInnerHTML={{ __html: content.html }} />
        ) : (
          <span>{content?.text}</span>
        )}
      </div>
    </div>
  );
};
