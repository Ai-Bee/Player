"use client";
import React from 'react';

interface FullscreenContainerProps {
  children: React.ReactNode;
}

// Provides a full screen flex container; hides scrollbars.
export const FullscreenContainer: React.FC<FullscreenContainerProps> = ({ children }) => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white flex flex-col p-(--safe-area-padding,0)">
      {children}
    </div>
  );
};
