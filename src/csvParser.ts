import type { TickerMap } from './types';

function normalizeNumber(val: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val.toString().replace(/,/g, ''));
}

export function processIBKR(rows: any[]): TickerMap {
    const stateTickers: TickerMap = {};
    
    function initTicker(ticker: string) {
        if (!stateTickers[ticker]) {
            stateTickers[ticker] = {
                ticker,
                premiumCollected: 0,
                opSharesHeld: 0,
                displayCost: 0,
                displayRealized: 0,
                currentPrice: 0,
                marketValue: 0,
                openPutContracts: 0,
                openPutStrikeSum: 0,
                hasOpenPosition: false,
                history: []
            };
        }
    }

    // Temporary storage for chronologically calculating Raw Equity Cost
    const stockTrades: Record<string, any[]> = {};
    const opCostBasisMap: Record<string, number> = {};

    rows.forEach(row => {
        if (!row || row.length < 12) return;

        // 1A. Parse Options Premium History
        if (row[0] === 'Trades' && row[1] === 'Data' && row[2] === 'Order' && row[3] === 'Equity and Index Options') {
            const optionString = row[5];
            if (!optionString) return;
            
            const baseTicker = optionString.split(' ')[0];
            initTicker(baseTicker);
            
            const proceeds = normalizeNumber(row[10]); 
            const commFee = normalizeNumber(row[11]);  
            const cashFlow = proceeds + commFee;

            stateTickers[baseTicker].premiumCollected += cashFlow;

            stateTickers[baseTicker].history.push({
                date: row[6],
                ticker: baseTicker,
                type: 'Option',
                action: 'Trade',
                quantity: normalizeNumber(row[7]),
                price: normalizeNumber(row[8]),
                proceeds,
                commFee,
                description: optionString,
            } as any); // Cast slightly since we only use specific fields in rendering
        }

        // 1B. Parse Stock Trade History (For Raw Equity Cost Reconstruction)
        if (row[0] === 'Trades' && row[1] === 'Data' && row[2] === 'Order' && row[3] === 'Stocks') {
            const baseTicker = row[5];
            if (!baseTicker) return;
            
            initTicker(baseTicker);
            if (!stockTrades[baseTicker]) stockTrades[baseTicker] = [];

            const qty = normalizeNumber(row[7]);
            const proceeds = normalizeNumber(row[10]); 
            const commFee = normalizeNumber(row[11]);  
            const cashFlow = proceeds + commFee;

            stockTrades[baseTicker].push({
                date: row[6],
                q: qty,
                cashFlow: cashFlow
            });

            stateTickers[baseTicker].history.push({
                date: row[6],
                ticker: baseTicker,
                type: 'Equity',
                action: 'Trade',
                quantity: qty,
                price: normalizeNumber(row[8]),
                proceeds,
                commFee,
                description: baseTicker + ' Equity'
            } as any);
        }
        
        // 2A. Parse Current Stock Holdings (Open Positions)
        if (row[0] === 'Open Positions' && row[1] === 'Data' && row[2] === 'Summary' && row[3] === 'Stocks') {
            const baseTicker = row[5];
            if (!baseTicker) return;
            
            initTicker(baseTicker);
            
            stateTickers[baseTicker].opSharesHeld = normalizeNumber(row[6]);
            opCostBasisMap[baseTicker] = normalizeNumber(row[9]);     
            stateTickers[baseTicker].currentPrice = normalizeNumber(row[10]);
            stateTickers[baseTicker].marketValue = normalizeNumber(row[11]);  
        }

        // 2B. Check for Open Option Positions
        if (row[0] === 'Open Positions' && row[1] === 'Data' && row[2] === 'Summary' && row[3] === 'Equity and Index Options') {
            const optionString = row[5];
            if (!optionString) return;
            
            const baseTicker = optionString.split(' ')[0];
            initTicker(baseTicker);

            const qty = normalizeNumber(row[6]);
            if (qty !== 0) {
                stateTickers[baseTicker].hasOpenPosition = true;
            }

            // Calculate Open Put Obligations
            const parts = optionString.split(' ');
            if (parts.length >= 4) {
                const strike = parseFloat(parts[2]);
                const type = parts[3].toUpperCase();
                
                if (type === 'P' && qty < 0) {
                    stateTickers[baseTicker].openPutContracts += Math.abs(qty);
                    stateTickers[baseTicker].openPutStrikeSum += strike * Math.abs(qty);
                }
            }
        }
    });

    // Finalize raw cost reconstruction
    Object.keys(stateTickers).forEach(ticker => {
        let d = stateTickers[ticker];
        let trades = stockTrades[ticker] || [];
        
        trades.sort((a,b) => a.date.localeCompare(b.date));
        
        let shares = 0;
        let rawCost = 0;
        let realizedPL = 0;

        trades.forEach(trade => {
            if (trade.q > 0) {
                shares += trade.q;
                rawCost += -trade.cashFlow;
            } else if (trade.q < 0) {
                let soldShares = Math.abs(trade.q);
                let avgCost = shares > 0 ? rawCost / shares : 0;
                
                rawCost -= soldShares * avgCost;
                shares += trade.q;
                
                realizedPL += trade.cashFlow - (soldShares * avgCost);
            }
        });

        if (Math.abs(shares - d.opSharesHeld) < 0.01) {
            d.displayCost = rawCost;
            d.displayRealized = realizedPL;
        } else {
            d.displayCost = opCostBasisMap[ticker] || 0;
            d.displayRealized = realizedPL; 
        }
    });

    return stateTickers;
}
