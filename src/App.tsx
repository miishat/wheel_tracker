import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Info } from 'lucide-react';
import { processIBKR } from './csvParser';
import type { TickerState } from './types';
import { TickerCard } from './components/TickerCard';
import { DetailedLedger } from './components/DetailedLedger';

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
    return localStorage.getItem('wheelTracker_fileName') || 'Choose CSV file or click to upload';
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

  useEffect(() => {
    localStorage.setItem('wheelTracker_fileName', fileName);
  }, [fileName]);

  useEffect(() => {
    localStorage.setItem('wheelTracker_tickers', JSON.stringify(tickers));
  }, [tickers]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatusMsg('Parsing CSV...');
    setStatusColor('var(--accent)');

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const parsedMap = processIBKR(results.data);
        const activeArray = Object.values(parsedMap)
          .filter(t => t.opSharesHeld > 0 || t.hasOpenPosition)
          .sort((a, b) => a.ticker.localeCompare(b.ticker));

        if (activeArray.length === 0) {
          setStatusMsg('No actively held/wheeled positions found.');
          setStatusColor('var(--danger)');
          setTickers([]);
          return;
        }

        setStatusMsg('Loaded successfully!');
        setStatusColor('var(--success)');
        setTickers(activeArray);
      },
      error: () => {
        setStatusMsg('Error parsing CSV.');
        setStatusColor('var(--danger)');
      }
    });
  };

  const activeStockWheels = tickers.filter(t => t.opSharesHeld > 0);
  const optionsOnlyWheels = tickers.filter(t => t.opSharesHeld === 0);

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
              <input type="file" id="csvFileInput" accept=".csv" onChange={handleFileUpload} onClick={(e) => { e.currentTarget.value = ''; }} />
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
            <label htmlFor="csvFileInputCompact" className="btn-upload">
               <FileUp size={16} /> Upload Another CSV
               <input type="file" id="csvFileInputCompact" accept=".csv" onChange={handleFileUpload} onClick={(e) => { e.currentTarget.value = ''; }} />
            </label>
          </div>
        )}

        <AnimatePresence>
          {tickers.length > 0 && (
            <motion.main 
              id="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {activeStockWheels.length > 0 && (
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
                    {activeStockWheels.map(t => (
                      <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                    ))}
                  </motion.div>
                </>
              )}

              {optionsOnlyWheels.length > 0 && (
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
                    {optionsOnlyWheels.map(t => (
                      <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                    ))}
                  </motion.div>
                </>
              )}
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
