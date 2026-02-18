"use client";
import React from 'react';
import { TickerConfig, TickerContent } from '@/lib/player/types';

interface TickerBarProps {
  config?: TickerConfig;
  content?: TickerContent;
  style?: React.CSSProperties; // Forwarding styles for absolute positioning
}

export const TickerBar: React.FC<TickerBarProps> = ({ config, content, style: containerStyle }) => {
  if (!config?.enabled || (!content?.text && !content?.html)) return null;

  const theme = config.theme || {};
  const duration = (config.speed && config.speed > 0) ? 2000 / config.speed : 30; // rough px/sec to seconds mapping for a wide container

  const tickerStyle: React.CSSProperties = {
    background: theme.bg || '#111',
    color: theme.color || '#fff',
    fontFamily: theme.fontFamily || 'sans-serif',
    fontSize: theme.fontSize || '1.5rem',
    ...containerStyle,
  };

  const itemContent = content.html ? (
    <span dangerouslySetInnerHTML={{ __html: content.html }} />
  ) : (
    <span>{content.text}</span>
  );

  return (
    <div
      className="absolute overflow-hidden flex items-center border-t border-white/10"
      style={tickerStyle}
    >
      <style jsx>{`
        .ticker-scroll {
          display: inline-block;
          white-space: nowrap;
          padding-left: 100%;
          animation: ticker-animation ${duration}s linear infinite;
        }
        @keyframes ticker-animation {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
      `}</style>
      <div className="ticker-scroll flex items-center">
        {itemContent}
        <span className="mx-8 opacity-50">•</span>
        {itemContent}
        <span className="mx-8 opacity-50">•</span>
        {itemContent}
        <span className="mx-8 opacity-50">•</span>
      </div>
    </div>
  );
};
