export interface TradeRecord {
  date: string;
  ticker: string;
  type: 'Option' | 'Equity';
  action: string;
  quantity: number;
  price: number;
  proceeds: number;
  commFee: number;
  description: string;
  // Option specific
  strike?: number;
  expiry?: string;
  callPut?: 'C' | 'P';
}

export interface TickerState {
  ticker: string;

  // Stock tracking
  opSharesHeld: number;
  displayCost: number;     // Raw Equity Cost or IBKR Cost Basis fallback
  displayRealized: number; // IBKR Realized P/L for equity
  currentPrice: number;    // Customizable Spot Price
  marketValue: number;     // Shares * Current Price

  // Option tracking
  openPutContracts: number;
  openPutStrikeSum: number;
  premiumCollected: number;

  // UI / Display properties
  hasOpenPosition: boolean; // True if opSharesHeld > 0 OR open option contracts exist

  history: TradeRecord[];
}

export type TickerMap = Record<string, TickerState>;
