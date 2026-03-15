import React, { useState } from 'react';
import type { TickerState } from '../types';
import { calculateBreakeven, calculateNetPL, formatCurr } from '../Calculations';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';

interface TickerCardProps {
    data: TickerState;
    onViewDetails: (ticker: string) => void;
}

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export const TickerCard: React.FC<TickerCardProps> = ({ data, onViewDetails }) => {
    const [spotPrice, setSpotPrice] = useState<number>(data.currentPrice);

    const breakeven = calculateBreakeven(data);
    const netPL = calculateNetPL(data, spotPrice);

    const handleSpotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) setSpotPrice(val);
    };

    const isStockWheel = data.opSharesHeld > 0;
    const isPositivePL = netPL >= 0;

    return (
        <motion.div 
            className="ticker-card"
            variants={itemVariants}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
        >
            <div className="ticker-header">
                <span className="ticker-name">{data.ticker}</span>
            </div>

            <div className="metric-row">
                <span className="metric-label">Shares</span>
                <span className="metric-value">{isStockWheel ? data.opSharesHeld : '0'}</span>
            </div>
            <div className="metric-row">
                <span className="metric-label">Total Cost of Shares</span>
                <span className="metric-value">{isStockWheel ? formatCurr(data.displayCost) : 'N/A'}</span>
            </div>
            <div className="metric-row">
                <span className="metric-label">Total Premium Collected</span>
                <span className={`metric-value ${data.premiumCollected >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurr(data.premiumCollected)}
                </span>
            </div>

            <div className="metric-row">
                <span className="metric-label" style={{ alignSelf: 'center' }}>Current Stock Price</span>
                <input
                    type="number"
                    className="spot-price-input"
                    value={spotPrice}
                    step="0.01"
                    onChange={handleSpotChange}
                />
            </div>

            <div className="metric-row" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <span className="metric-label" style={{ color: '#fff' }}>True Breakeven Price</span>
                <span className="metric-value" style={{ color: '#fff' }}>
                    {isNaN(breakeven) ? 'N/A' : formatCurr(breakeven)}
                </span>
            </div>

            <div className="net-pl-row">
                <span className="net-pl-label">
                    Net Profit/Loss 
                </span>
                <span className={`net-pl-value ${isPositivePL ? 'positive' : 'negative'}`}>
                    {formatCurr(netPL)}
                </span>
            </div>

            <button className="btn-details" onClick={() => onViewDetails(data.ticker)}>
                <Eye size={16} /> View Details
            </button>
        </motion.div>
    );
};
