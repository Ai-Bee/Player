import { ScreenLayout } from "./types";

export interface Box {
    top: string;
    left: string;
    width: string;
    height: string;
}

export interface ResolvedLayout {
    main: Box;
    sidePanel?: Box & { position: "left" | "right" };
    ticker?: Box & { position: "top" | "bottom" };
    fullscreenOverride?: boolean;
}

/**
 * Enforces deterministic geometry calculation for screen zones:
 * 1. If override active -> render fullscreen overlay (logic handled in UI, but layout reflects it).
 * 2. Apply side panel width reduction (max 30%).
 * 3. Apply ticker height reduction (fixed height).
 * 4. Assign remaining area to main zone.
 */
export function resolveLayout(layout?: ScreenLayout): ResolvedLayout {
    const result: ResolvedLayout = {
        main: { top: '0', left: '0', width: '100%', height: '100%' },
    };

    if (!layout) return result;

    if (layout.overlays?.override?.active) {
        result.fullscreenOverride = true;
        return result;
    }

    let mainTop = 0;
    let mainLeft = 0;
    let mainWidth = 100;
    let mainHeight = 100;

    // 1. Ticker (Priority for vertical space)
    if (layout.ticker?.enabled) {
        const tickerHeight = 8; // 8% or fixed 60px equivalent in vh
        if (layout.ticker.position === 'top') {
            result.ticker = { top: '0', left: '0', width: '100%', height: `${tickerHeight}%`, position: 'top' };
            mainTop = tickerHeight;
            mainHeight -= tickerHeight;
        } else {
            result.ticker = { top: `${100 - tickerHeight}%`, left: '0', width: '100%', height: `${tickerHeight}%`, position: 'bottom' };
            mainHeight -= tickerHeight;
        }
    }

    // 2. Side Panel (Occupies remaining height after ticker)
    if (layout.sidePanel?.enabled) {
        let sideWidth = Math.min(layout.sidePanel.widthPercent, 30);
        // Ensure main content is at least 50%
        if (100 - sideWidth < 50) {
            sideWidth = 50;
        }

        if (layout.sidePanel.position === 'left') {
            result.sidePanel = {
                top: `${mainTop}%`,
                left: '0',
                width: `${sideWidth}%`,
                height: `${mainHeight}%`,
                position: 'left'
            };
            mainLeft = sideWidth;
            mainWidth -= sideWidth;
        } else {
            result.sidePanel = {
                top: `${mainTop}%`,
                left: `${100 - sideWidth}%`,
                width: `${sideWidth}%`,
                height: `${mainHeight}%`,
                position: 'right'
            };
            mainWidth -= sideWidth;
        }
    }

    result.main = {
        top: `${mainTop}%`,
        left: `${mainLeft}%`,
        width: `${mainWidth}%`,
        height: `${mainHeight}%`,
    };

    return result;
}
