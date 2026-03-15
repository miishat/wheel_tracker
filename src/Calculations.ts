import type { TickerState } from './types';

export function calculateBreakeven(d: TickerState): number {
    if (d.opSharesHeld > 0) {
        return (d.displayCost - d.premiumCollected - d.displayRealized) / d.opSharesHeld;
    } else if (d.openPutContracts > 0) {
        const putShares = d.openPutContracts * 100;
        const totalStrikeObligation = d.openPutStrikeSum * 100;
        return (totalStrikeObligation - d.premiumCollected - d.displayRealized) / putShares;
    }
    return NaN;
}

export function calculateNetPL(d: TickerState, dynamicSpotPrice: number): number {
    if (d.opSharesHeld > 0) {
        const dynamicMarketValue = dynamicSpotPrice * d.opSharesHeld;
        return dynamicMarketValue + d.premiumCollected + d.displayRealized - d.displayCost;
    } else if (d.openPutContracts > 0) {
        // V6 Options-Only Math:
        const breakeven = calculateBreakeven(d);
        if (dynamicSpotPrice >= breakeven) {
            return d.premiumCollected; // Puts expire worthless, user keeps full premium
        } else {
            const putShares = d.openPutContracts * 100;
            return d.premiumCollected - ((breakeven - dynamicSpotPrice) * putShares);
        }
    }
    
    // Fallback
    return d.marketValue + d.premiumCollected + d.displayRealized - d.displayCost;
}

export function formatCurr(val: number): string {
    if (isNaN(val)) return 'N/A';
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
