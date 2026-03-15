import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, FileDown, Info, Trash2, Search, ArrowUpDown } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { processIBKR } from './csvParser';
import type { TickerState } from './types';
import { TickerCard } from './components/TickerCard';
import { DetailedLedger } from './components/DetailedLedger';
import { calculateNetPL } from './Calculations';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

function App() {
  const [fileName, setFileName] = useState<string>(() => {
    return localStorage.getItem('wheelTracker_fileName') || 'Choose CSV file(s) or click to upload';
  });
  const [rawRows, setRawRows] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('wheelTracker_rawRows');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [tickers, setTickers] = useState<TickerState[]>(() => {
    try {
      const saved = localStorage.getItem('wheelTracker_tickers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [statusMsg, setStatusMsg] = useState<string>(
    tickers.length > 0 ? 'Restored from local storage' : ''
  );
  const [statusColor, setStatusColor] = useState<string>(
    tickers.length > 0 ? 'var(--success)' : 'var(--text-secondary)'
  );
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'closed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'alpha' | 'plHighToLow' | 'plLowToHigh'>('alpha');

  useEffect(() => {
    localStorage.setItem('wheelTracker_fileName', fileName);
  }, [fileName]);

  useEffect(() => {
    localStorage.setItem('wheelTracker_tickers', JSON.stringify(tickers));
  }, [tickers]);

  useEffect(() => {
    localStorage.setItem('wheelTracker_rawRows', JSON.stringify(rawRows));
  }, [rawRows]);

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      setRawRows([]);
      setTickers([]);
      setFileName('Choose CSV file(s) or click to upload');
      setStatusMsg('');
      setStatusColor('var(--text-secondary)');
      setSelectedTicker(null);
      localStorage.removeItem('wheelTracker_rawRows');
      localStorage.removeItem('wheelTracker_tickers');
      localStorage.removeItem('wheelTracker_fileName');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStatusMsg('Parsing CSV(s)...');
    setStatusColor('var(--accent)');

    let newRows: any[] = [];
    let filesProcessed = 0;

    Array.from(files).forEach((file) => {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (results) => {
          newRows = [...newRows, ...results.data];
          filesProcessed++;

          if (filesProcessed === files.length) {
            processAggregatedData(newRows, files.length);
          }
        },
        error: () => {
          setStatusMsg('Error parsing one or more CSVs.');
          setStatusColor('var(--danger)');
        }
      });
    });
  };

  const processAggregatedData = (newRows: any[], numNewFiles: number) => {
    // 1. Combine new rows with existing raw rows
    const combinedRows = [...rawRows, ...newRows];

    // 2. Deduplicate rows based on a unique hash of the trade metrics 
    // Format: date_ticker_type_quantity_price_proceeds
    const uniqueRowsMap = new Map<string, any>(); 
    
    combinedRows.forEach(row => {
      if (!row || row.length < 12) return;
      
      // We only care about Trades or Open Positions rows
      const isTrade = row[0] === 'Trades' && row[1] === 'Data' && row[2] === 'Order';
      const isOpenPos = row[0] === 'Open Positions' && row[1] === 'Data' && row[2] === 'Summary';
      
      if (!isTrade && !isOpenPos) {
        return; 
      }

      const isOptions = row[3] === 'Equity and Index Options';
      const isStock = row[3] === 'Stocks';
      
      if (isTrade && (isOptions || isStock)) {
        // Create a deterministic hash for deduplication of Trades
        const hash = `${row[0]}_${row[3]}_${row[5]}_${row[6]}_${row[7]}_${row[8]}_${row[10]}`;
        uniqueRowsMap.set(hash, row);
      } else if (isOpenPos && (isOptions || isStock)) {
        // For open positions, we intentionally do nothing here with uniqueRowsMap
        // We will just filter the newest ones below
      }
    });

    // To properly handle Open Positions moving from Open -> Closed between files:
    // 1. Find all Trades to accurately build history (done via uniqueRowsMap)
    // 2. ONLY use the 'Open Positions' from the VERY LAST file uploaded.
    // If multiple files are uploaded at once, `newRows` contains them in some order. 
    // The safest way is to filter `newRows` for open positions and use ONLY those for the current state,
    // discarding any open positions parsed from previous files (`rawRows`).

    const latestOpenPosRows = newRows.filter(row => 
      row && row.length >= 12 && 
      row[0] === 'Open Positions' && row[1] === 'Data' && row[2] === 'Summary' &&
      (row[3] === 'Equity and Index Options' || row[3] === 'Stocks')
    );

    const dedupedTradeRows = Array.from(uniqueRowsMap.values());
    
    // Combine deduplicated trades with ONLY the latest open positions
    const dedupedRows = [...dedupedTradeRows, ...latestOpenPosRows];
    
    setRawRows(dedupedRows);

    // 3. Process the fully deduplicated dataset
    const parsedMap = processIBKR(dedupedRows);
    const allArray = Object.values(parsedMap)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    if (allArray.length === 0) {
      setStatusMsg('No positions found in the combined data.');
      setStatusColor('var(--danger)');
      setTickers([]);
      return;
    }

    // 4. Update UI
    const totalFilesObj = fileName.match(/\d+/) ? parseInt(fileName.match(/\d+/)![0]) : (rawRows.length > 0 ? 1 : 0);
    const totalFiles = totalFilesObj + numNewFiles;
    const newFileName = totalFiles > 1 ? `Aggregated ${totalFiles} Files` : 'Aggregated Data';
    
    setFileName(newFileName);
    setStatusMsg('Aggregated successfully!');
    setStatusColor('var(--success)');
    setTickers(allArray);
  };

  const handleExportPDF = async () => {
    const dashboardElement = document.getElementById('dashboard-wrapper');
    if (!dashboardElement) return;

    setIsExporting(true);
    setStatusMsg('Generating PDF...');
    setStatusColor('var(--accent)');

    try {
      // Small pause to allow UI update
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(dashboardElement, {
        backgroundColor: '#0a0a0a', // Use background color from css
        scale: 2, 
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      let pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let position = 10;
      let imgHeightLeft = pdfHeight;
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      imgHeightLeft -= (pageHeight - 10);

      // Handle multi-page if needed
      while (imgHeightLeft >= 0) {
        position = imgHeightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        imgHeightLeft -= pageHeight;
      }

      pdf.save(`Wheel-Tracker-Dashboard-${new Date().toISOString().split('T')[0]}.pdf`);

      setStatusMsg('PDF Exported Successfully!');
      setStatusColor('var(--success)');
    } catch (err) {
      console.error(err);
      setStatusMsg('Error exporting PDF.');
      setStatusColor('var(--danger)');
    } finally {
      setIsExporting(false);
    }
  };

  const activeStockWheels = tickers.filter(t => t.opSharesHeld > 0);
  const optionsOnlyWheels = tickers.filter(t => t.opSharesHeld === 0 && t.hasOpenPosition);
  const closedWheels = tickers.filter(t => t.opSharesHeld === 0 && !t.hasOpenPosition);

  // Sorting and Filtering Logic
  const getProcessedArray = (arr: TickerState[]) => {
    // 1. Filter
    let processed = arr;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      processed = processed.filter(t => t.ticker.toLowerCase().includes(q));
    }

    // 2. Sort
    return processed.sort((a, b) => {
      if (sortMode === 'alpha') {
        return a.ticker.localeCompare(b.ticker);
      }
      
      const plA = calculateNetPL(a, a.currentPrice);
      const plB = calculateNetPL(b, b.currentPrice);

      if (sortMode === 'plHighToLow') return plB - plA;
      if (sortMode === 'plLowToHigh') return plA - plB;
      
      return 0;
    });
  };

  const processedActiveStocks = getProcessedArray(activeStockWheels);
  const processedOptionsOnly = getProcessedArray(optionsOnlyWheels);
  const processedClosed = getProcessedArray(closedWheels);

  return (
    <>
      <div className="app-background"></div>
      <div className="container">
        <header className="app-header">
          <h1>Wheel Strategy Tracker</h1>
          <p>Upload your Interactive Brokers Activity Statement (CSV) to track options premium, cost basis, and dynamic Net P/L.</p>
        </header>

        {!tickers.length ? (
          <section className="upload-section dark-panel">
            <label htmlFor="csvFileInput" className="file-drop-area">
              <FileUp size={32} color="var(--accent)" style={{ marginBottom: '10px' }} />
              <span className="file-msg">{fileName}</span>
              <input type="file" id="csvFileInput" accept=".csv" multiple onChange={handleFileUpload} onClick={(e) => { e.currentTarget.value = ''; }} />
            </label>
            <div className="status-msg" style={{ color: statusColor }}>{statusMsg}</div>
          </section>
        ) : (
          <div className="compact-upload">
            <div className="file-info">
              <span style={{ color: statusColor, fontWeight: 600 }}>{statusMsg}</span>
              <span>•</span>
              <span>{fileName}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-upload" 
                onClick={handleExportPDF} 
                disabled={isExporting}
                style={{ 
                  background: isExporting ? 'rgba(255,255,255,0.1)' : 'rgba(0, 255, 102, 0.1)', 
                  borderColor: isExporting ? 'var(--text-secondary)' : 'var(--success)', 
                  color: isExporting ? 'var(--text-secondary)' : 'var(--success)',
                  opacity: isExporting ? 0.7 : 1
                }}
              >
                <FileDown size={16} /> {isExporting ? 'Exporting...' : 'Export PDF'}
              </button>
              <label htmlFor="csvFileInputCompact" className="btn-upload">
                 <FileUp size={16} /> Add More CSVs
                 <input type="file" id="csvFileInputCompact" accept=".csv" multiple onChange={handleFileUpload} onClick={(e) => { e.currentTarget.value = ''; }} />
              </label>
              <button 
                className="btn-upload" 
                onClick={handleClearData} 
                style={{ background: 'rgba(255, 51, 102, 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                <Trash2 size={16} /> Clear
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {tickers.length > 0 && (
            <motion.main 
              id="dashboard-wrapper"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ paddingBottom: '20px' }}
            >
              <div className="filters-row">
                <div className="search-bar">
                  <Search size={18} color="var(--text-secondary)" />
                  <input 
                    type="text" 
                    placeholder="Search tickers..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="sort-dropdown">
                  <ArrowUpDown size={18} color="var(--text-secondary)" />
                  <select 
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as any)}
                  >
                    <option value="alpha">Alphabetical (A-Z)</option>
                    <option value="plHighToLow">Highest Net P/L</option>
                    <option value="plLowToHigh">Lowest Net P/L</option>
                  </select>
                </div>
              </div>

              <div className="view-toggle">
                <button 
                  className={`toggle-btn ${viewMode === 'active' ? 'active' : ''}`} 
                  onClick={() => setViewMode('active')}
                >
                  Active Wheels
                </button>
                <button 
                  className={`toggle-btn ${viewMode === 'closed' ? 'active' : ''}`} 
                  onClick={() => setViewMode('closed')}
                >
                  History (Closed)
                </button>
              </div>

              <div id="dashboard">
                {viewMode === 'active' ? (
                  <>
                    {processedActiveStocks.length > 0 && (
                      <>
                        <div className="dashboard-header">
                          <h2>Active Stock Wheels</h2>
                        </div>
                        <motion.div 
                          className="ticker-grid" 
                          variants={containerVariants} 
                          initial="hidden" 
                          animate="show"
                          style={{ marginBottom: '4rem' }}
                        >
                          {processedActiveStocks.map(t => (
                            <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                          ))}
                        </motion.div>
                      </>
                    )}

                    {processedOptionsOnly.length > 0 && (
                      <>
                        <div className="dashboard-header">
                          <h2>Cash-Secured Puts (Options Only) <Info size={16} style={{marginLeft: '8px', opacity: 0.5}}/></h2>
                        </div>
                        <motion.div 
                          className="ticker-grid"
                          variants={containerVariants} 
                          initial="hidden" 
                          animate="show"
                        >
                          {processedOptionsOnly.map(t => (
                            <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                          ))}
                        </motion.div>
                      </>
                    )}

                    {processedActiveStocks.length === 0 && processedOptionsOnly.length === 0 && (
                      <div className="status-msg" style={{color: 'var(--text-secondary)', textAlign: 'center'}}>No matching active positions found.</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="dashboard-header">
                      <h2>Closed Wheels (History) <Info size={16} style={{marginLeft: '8px', opacity: 0.5}}/></h2>
                    </div>
                    {processedClosed.length > 0 ? (
                      <motion.div 
                        className="ticker-grid" 
                        variants={containerVariants} 
                        initial="hidden" 
                        animate="show"
                      >
                        {processedClosed.map(t => (
                          <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                        ))}
                      </motion.div>
                    ) : (
                      <div className="status-msg" style={{color: 'var(--text-secondary)', textAlign: 'center'}}>No matching closed positions found.</div>
                    )}
                  </>
                )}
              </div>
            </motion.main>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedTicker && (
          <DetailedLedger 
            data={tickers.find(t => t.ticker === selectedTicker)!} 
            onClose={() => setSelectedTicker(null)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
