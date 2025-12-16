"use client";
import React from 'react';

export const OfflineBadge: React.FC<{ online: boolean }> = ({ online }) => {
  if (online) return null;
  return (
    <div className="absolute top-0 left-0 m-2 px-3 py-1 rounded bg-orange-600 text-xs font-semibold shadow">OFFLINE</div>
  );
};
