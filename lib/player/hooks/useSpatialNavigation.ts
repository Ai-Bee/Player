"use client";
import { useEffect, useCallback } from 'react';

/**
 * A basic spatial navigation implementation for D-pad/Arrow keys.
 * This focuses the next/previous focusable element based on DOM order.
 * In a more complex app, this would use geometry to find the nearest neighbor.
 */
export function useSpatialNavigation(enabled: boolean) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;

        const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusables = Array.from(document.querySelectorAll(focusableSelector)) as HTMLElement[];
        const index = focusables.indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            const nextIndex = (index + 1) % focusables.length;
            focusables[nextIndex]?.focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const nextIndex = (index - 1 + focusables.length) % focusables.length;
            focusables[nextIndex]?.focus();
        } else if (e.key === 'Backspace' || e.key === 'Escape') {
            // Typically 'Back' on TV remotes maps to Backspace or Escape
            // This is handled by a separate contract, but safe to preventDefault here if needed
        }
    }, [enabled]);

    useEffect(() => {
        if (enabled) {
            window.addEventListener('keydown', handleKeyDown);
            // Ensure something is focused if nothing is
            if (!document.activeElement || document.activeElement === document.body) {
                const firstFocusable = document.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement;
                firstFocusable?.focus();
            }
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, handleKeyDown]);
}
