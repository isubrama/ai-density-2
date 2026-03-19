import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Activity, Cpu, Zap, BarChart3, Globe } from 'lucide-react';
import './App.css';

interface ChatbotData {
  id: number;
  tps: number;
  totalTokens: number;
  lastToken: string;
  fullResponse: string;
  isGenerating: boolean;
}

interface ModelGroup {
  name: string;
  aggregateTps: number;
}

interface GlobalStats {
  totalTps: number;
  peakTps: number;
  isStarted: boolean;
}

interface ChatbotItemProps {
  id: number;
  bot: ChatbotData | undefined;
}

const ChatbotItem: React.FC<ChatbotItemProps> = React.memo(({ id, bot }) => {
  return (
    <div className={`chatbot-item glass-inset ${bot?.isGenerating ? 'active' : ''}`}>
      <div className="bot-meta">
        <span className="bot-id">#{id + 1}</span>
        <span className="bot-tps">{bot?.tps.toFixed(1)} <small>t/s</small></span>
      </div>
      <div className="bot-stream">
        {bot?.fullResponse || <span className="placeholder">Awaiting inference...</span>}
        {bot?.isGenerating && <span className="cursor"></span>}
      </div>
    </div>
  );
});

const App: React.FC = () => {
  const [chatbots, setChatbots] = useState<Record<number, ChatbotData>>({});
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalTps: 0,
    peakTps: 0,
    isStarted: false,
  });

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize 20 chatbots
    const initialChatbots: Record<number, ChatbotData> = {};
    for (let i = 0; i < 20; i++) {
      initialChatbots[i] = {
        id: i,
        tps: 0,
        totalTokens: 0,
        lastToken: '',
        fullResponse: '',
        isGenerating: false,
      };
    }
    setChatbots(initialChatbots);

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
    const wsUrl = `${protocol}//${host}`;
    
    const connectWs = () => {
      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'BATCH_UPDATE') {
          const batch = message.payload;
          
          setChatbots(prev => {
            const next = { ...prev };
            let hasTokenUpdate = false;
            let lastStats = null;

            for (const subMsg of batch) {
              if (subMsg.type === 'TEXT_STREAM') {
                const { chatbotId, token, tps, totalTokens } = subMsg.payload;
                next[chatbotId] = {
                  ...next[chatbotId],
                  lastToken: token,
                  fullResponse: (next[chatbotId].fullResponse + token).slice(-500),
                  tps,
                  totalTokens,
                  isGenerating: true,
                };
                hasTokenUpdate = true;
              } else if (subMsg.type === 'STATS_UPDATE') {
                lastStats = subMsg.payload;
              }
            }

            if (lastStats) {
              setGlobalStats(prevStats => ({
                ...prevStats,
                totalTps: lastStats.totalTps,
                peakTps: lastStats.peakTps,
              }));
              setModelGroups(lastStats.modelGroups);
            }

            return hasTokenUpdate ? next : prev;
          });
        } else if (message.type === 'STATUS_CHANGE') {

      ws.current.onclose = () => {
        setTimeout(connectWs, 3000); // Reconnect
      };
    };

    connectWs();

    // Fetch initial stats
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        setGlobalStats(data.global);
        setModelGroups(data.models.map((m: any) => ({ name: m.name, aggregateTps: m.aggregateTps })));
      })
      .catch(err => console.error('Failed to fetch stats:', err));

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const handleToggle = async () => {
    const endpoint = globalStats.isStarted ? '/api/stop' : '/api/start';
    try {
      await fetch(endpoint, { method: 'POST' });
    } catch (err) {
      console.error('Failed to toggle:', err);
    }
  };

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <div className="logo">
            <Zap className="icon-neon" />
            <h1>Inference<span>Density</span></h1>
          </div>
          <button className={`toggle-btn ${globalStats.isStarted ? 'stop' : 'start'}`} onClick={handleToggle}>
            {globalStats.isStarted ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            {globalStats.isStarted ? 'Stop All' : 'Start All'}
          </button>
        </div>
        
        <div className="global-stats">
          <div className="stat-card glass">
            <span className="label"><Activity size={14} /> Total TPS</span>
            <span className="value highlight">{globalStats.totalTps.toFixed(2)}</span>
          </div>
          <div className="stat-card glass">
            <span className="label"><BarChart3 size={14} /> Peak TPS</span>
            <span className="value">{globalStats.peakTps.toFixed(2)}</span>
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        {modelGroups.map((group, gIdx) => (
          <div key={gIdx} className="model-node glass">
            <div className="node-header">
              <div className="node-info">
                <Cpu size={16} className="icon-muted" />
                <h3>{group.name}</h3>
              </div>
              <div className="node-tps">
                <span className="muted">Group TPS</span>
                <span className="value">{group.aggregateTps.toFixed(1)}</span>
              </div>
            </div>

            <div className="chatbot-list">
              {Array.from({ length: 5 }, (_, cIdx) => {
                const id = gIdx * 5 + cIdx;
                return <ChatbotItem key={id} id={id} bot={chatbots[id]} />;
              })}
            </div>
          </div>
        ))}
        {modelGroups.length === 0 && <div className="loading-state glass">Initializing high-density inference nodes...</div>}
      </main>

      <footer className="glass-footer">
        <div className="footer-content">
          <Globe size={14} />
          <span>Ampere Altra CPU Cluster • Parallel Inference PoC • 2026-v1.4</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
