import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, FileDown, Info } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'closed'>('active');

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
        const allArray = Object.values(parsedMap)
          .sort((a, b) => a.ticker.localeCompare(b.ticker));

        if (allArray.length === 0) {
          setStatusMsg('No positions found.');
          setStatusColor('var(--danger)');
          setTickers([]);
          return;
        }

        setStatusMsg('Loaded successfully!');
        setStatusColor('var(--success)');
        setTickers(allArray);
      },
      error: () => {
        setStatusMsg('Error parsing CSV.');
        setStatusColor('var(--danger)');
      }
    });
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
                 <FileUp size={16} /> Upload Another CSV
                 <input type="file" id="csvFileInputCompact" accept=".csv" onChange={handleFileUpload} onClick={(e) => { e.currentTarget.value = ''; }} />
              </label>
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

                    {activeStockWheels.length === 0 && optionsOnlyWheels.length === 0 && (
                      <div className="status-msg" style={{color: 'var(--text-secondary)', textAlign: 'center'}}>No active positions right now.</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="dashboard-header">
                      <h2>Closed Wheels (History) <Info size={16} style={{marginLeft: '8px', opacity: 0.5}}/></h2>
                    </div>
                    {closedWheels.length > 0 ? (
                      <motion.div 
                        className="ticker-grid" 
                        variants={containerVariants} 
                        initial="hidden" 
                        animate="show"
                      >
                        {closedWheels.map(t => (
                          <TickerCard key={t.ticker} data={t} onViewDetails={setSelectedTicker} />
                        ))}
                      </motion.div>
                    ) : (
                      <div className="status-msg" style={{color: 'var(--text-secondary)', textAlign: 'center'}}>No closed positions found.</div>
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
