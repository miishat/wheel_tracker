import React from 'react';
import type { TickerState } from '../types';
import { formatCurr } from '../Calculations';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface DetailedLedgerProps {
    data: TickerState;
    onClose: () => void;
}

export const DetailedLedger: React.FC<DetailedLedgerProps> = ({ data, onClose }) => {
    const sortedHistory = [...data.history].sort((a, b) => a.date.localeCompare(b.date));

    let rollingCF = 0;

    return (
        <motion.div 
            className="modal" 
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div 
                className="modal-content"
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
            >
                <button className="close-btn" onClick={onClose} aria-label="Close">
                    <X size={24} />
                </button>
                <h2>{data.ticker} Detailed Ledger</h2>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Instrument</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Net Cash Flow</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedHistory.map((h, i) => {
                                rollingCF += h.proceeds + h.commFee;
                                const cashflow = h.proceeds + h.commFee;
                                const cashFlowClass = cashflow > 0 ? 'row-positive' : cashflow < 0 ? 'row-negative' : '';
                                const qtyClass = h.quantity > 0 ? 'row-positive' : h.quantity < 0 ? 'row-negative' : '';

                                return (
                                    <tr key={i}>
                                        <td>{h.date}</td>
                                        <td>{h.description}</td>
                                        <td className={qtyClass}>{h.quantity}</td>
                                        <td>{formatCurr(h.price)}</td>
                                        <td className={cashFlowClass}>{formatCurr(cashflow)}</td>
                                    </tr>
                                );
                            })}
                            
                            <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>
                                    Account Ledger Net Cash Flow:
                                </td>
                                <td className={rollingCF > 0 ? 'row-positive' : rollingCF < 0 ? 'row-negative' : ''} style={{ fontWeight: 'bold' }}>
                                    {formatCurr(rollingCF)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
};
