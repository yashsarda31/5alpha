import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/ui';
import Sparkline from '../components/Sparkline';
import { usePrediction } from '../PredictionContext';
import './TradingGame.css';

const SIZED_KEY = 'alphanova_sized_today'; // stamped by the Position Sizing page

// Daily Bosses definition
const BOSSES = [
  { 
    name: "The FOMO Beast", 
    emoji: "👺", 
    maxHp: 100, 
    description: "Attacks when you see green candles and buy without a plan.", 
    color: "#FF453A" 
  },
  { 
    name: "The Revenge Serpent", 
    emoji: "🐍", 
    maxHp: 100, 
    description: "Strikes after a loss, whispering to double your position sizing.", 
    color: "#FF9F0A" 
  },
  { 
    name: "The Overtrading Hydra", 
    emoji: "🐉", 
    maxHp: 120, 
    description: "Grows heads with every trade you enter just to 'feel something'.", 
    color: "#BF5AF2" 
  },
  { 
    name: "The Leverage Titan", 
    emoji: "👹", 
    maxHp: 150, 
    description: "Tempts you to risk 50% of your account on a single stock tip.", 
    color: "var(--primary-accent)" 
  }
];

// Available Inventory items
const INVENTORY_ITEMS = [
  { id: 'shield', name: 'Stop-Loss Shield', emoji: '🛡️', description: 'Protects discipline from drawdown. (+10% Sizing Mastery)', category: 'sizing' },
  { id: 'elixir', name: 'Patience Elixir', emoji: '🧪', description: 'Consolidation brew. (+15% Overtrade Resistance)', category: 'patience' },
  { id: 'ledger', name: 'Ledger of Truth', emoji: '📜', description: 'Exposes trading errors. (+10% Journal Mastery)', category: 'journal' },
  { id: 'amulet', name: 'Zen Amulet', emoji: '💎', description: 'Suppresses revenge trading. (+15% Calmness)', category: 'calm' },
  { id: 'compass', name: 'Gold Trend Compass', emoji: '🧭', description: 'Points towards high probability setups. (+10% Zen)', category: 'zen' },
  { id: 'ruler', name: 'Ruler of Leverage', emoji: '📏', description: 'Measures risk precisely. (+15% Sizing Mastery)', category: 'sizing' }
];

const DEFAULT_STATE = {
  avatarName: "Zen Trader",
  xp: 0,
  level: 1,
  streak: 0,
  lastQuestDate: "", // YYYY-MM-DD
  lastQuestCompletedDate: "", // YYYY-MM-DD
  completedQuests: {
    sizing: false,
    journal: false,
    noOvertrade: false,
    noRevenge: false,
    calmness: false,
    dailyCall: false
  },
  questHistory: {}, // 'YYYY-MM-DD' -> quests completed that day (heatmap)
  bossHp: 100,
  bossDefeated: false,
  inventory: [], // IDs of items
  equippedItemId: null,
  journalLogs: [], // { id, date, entry, mood, tags }
  moodLogs: [], // { date, mood, note }
  lastMoodDate: "", // YYYY-MM-DD
  lastJournalDate: "", // YYYY-MM-DD
  stats: {
    sizing: 20,
    journal: 20,
    noOvertrade: 20,
    noRevenge: 20,
    calmness: 20
  }
};

// GitHub-style calendar of quests completed per day (last 12 weeks).
// History accrues from the day this shipped — no fabricated backfill.
const QuestHeatmap = ({ history }) => {
  const days = [];
  const now = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const count = (history || {})[key] || 0;
    days.push({ key, count });
  }
  const level = (c) => (c >= 4 ? 'h3' : c >= 2 ? 'h2' : c >= 1 ? 'h1' : '');
  return (
    <div>
      <div className="arena-heatmap" aria-label="Daily quest completion heatmap">
        {days.map((d) => (
          <span
            key={d.key}
            className={`arena-heat-cell ${level(d.count)}`}
            title={`${d.key}: ${d.count} quest${d.count === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="arena-heat-legend">
        <span>Less</span>
        <span className="arena-heat-cell" />
        <span className="arena-heat-cell h1" />
        <span className="arena-heat-cell h2" />
        <span className="arena-heat-cell h3" />
        <span>More</span>
      </div>
    </div>
  );
};

// Reset daily quests, boss, and streak when a new calendar day starts
const applyDailyReset = (state) => {
  const today = new Date().toISOString().split('T')[0];
  if (state.lastQuestDate === today) return state;

  const updated = { ...state };
  updated.lastQuestDate = today;
  updated.completedQuests = {
    sizing: false,
    journal: false,
    noOvertrade: false,
    noRevenge: false,
    calmness: false,
    dailyCall: false
  };
  const dayBoss = BOSSES[new Date(today).getDate() % BOSSES.length];
  updated.bossHp = dayBoss.maxHp;
  updated.bossDefeated = false;

  // Streak breaks if the last completed quest was more than 1 day ago
  if (state.lastQuestCompletedDate) {
    const lastDate = new Date(state.lastQuestCompletedDate);
    const currentDate = new Date(today);
    const diffTime = Math.abs(currentDate - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      updated.streak = 0;
    }
  }
  return updated;
};

const TradingGame = () => {
  const [gameState, setGameState] = useState(() => {
    const saved = localStorage.getItem('alphanova_trading_game_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure structure is correct
        return applyDailyReset({ ...DEFAULT_STATE, ...parsed });
      } catch (e) {
        console.error("Failed to parse game state:", e);
        return applyDailyReset(DEFAULT_STATE);
      }
    }
    return applyDailyReset(DEFAULT_STATE);
  });

  const [editNameMode, setEditNameMode] = useState(false);
  const [nameInput, setNameInput] = useState(gameState.avatarName);
  const [journalInput, setJournalInput] = useState("");
  const [journalTags, setJournalTags] = useState({ sizing: false, overtrade: false, revenge: false, setup: false });
  const [moodInput, setMoodInput] = useState(3);
  const [moodNote, setMoodNote] = useState("");
  const [floatingTexts, setFloatingTexts] = useState([]); // { id, x, y, text, type }
  const [isBossShaking, setIsBossShaking] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [lootNotification, setLootNotification] = useState(null); // { name, emoji }
  const [moodMsg, setMoodMsg] = useState('');       // inline, no alert()
  const [importMsg, setImportMsg] = useState(null); // { ok, text }
  const [confirmReset, setConfirmReset] = useState(false); // two-step reset
  const [journalFilter, setJournalFilter] = useState('all');
  const { today: predictionToday } = usePrediction();

  const bossRef = useRef(null);
  const resetTimerRef = useRef(null);

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem('alphanova_trading_game_state', JSON.stringify(gameState));
  }, [gameState]);

  const currentBoss = BOSSES[new Date(gameState.lastQuestDate || new Date().toISOString().split('T')[0]).getDate() % BOSSES.length];

  // Helper to trigger floating damage/XP indicators
  const spawnFloatingText = (text, type, elementRef) => {
    let x = 50 + Math.random() * 20;
    let y = 30 + Math.random() * 20;
    if (elementRef && elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      // approximate within box
      x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 50;
      y = rect.top + rect.height / 3 + (Math.random() - 0.5) * 30;
    }
    const id = Date.now() + Math.random().toString();
    setFloatingTexts(prev => [...prev, { id, x, y, text, type }]);
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(t => t.id !== id));
    }, 1200);
  };

  // XP progression calculation
  const getXpThreshold = (level) => level * 200; // Level 1 needs 200, Level 2 needs 400, etc.

  const addXp = (amount, customState = null) => {
    const state = customState || gameState;
    let newXp = state.xp + amount;
    let newLevel = state.level;
    let triggeredLevelUp = false;

    while (newXp >= getXpThreshold(newLevel)) {
      newXp -= getXpThreshold(newLevel);
      newLevel += 1;
      triggeredLevelUp = true;
    }

    if (triggeredLevelUp) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 4000);
      
      // Auto-unlock random item on level up
      const unownedItems = INVENTORY_ITEMS.filter(item => !state.inventory.includes(item.id));
      let updatedInventory = [...state.inventory];
      if (unownedItems.length > 0) {
        const item = unownedItems[Math.floor(Math.random() * unownedItems.length)];
        updatedInventory.push(item.id);
        setLootNotification(item);
        setTimeout(() => setLootNotification(null), 5000);
      }

      return { ...state, xp: newXp, level: newLevel, inventory: updatedInventory };
    }

    return { ...state, xp: newXp };
  };

  // Get Rank name based on Level
  const getRankName = (level) => {
    if (level === 1) return "Disciplined Rookie";
    if (level === 2) return "Patience Apprentice";
    if (level === 3) return "Risk Tactician";
    if (level === 4) return "Zen Market Wizard";
    return "Legendary Market Master";
  };

  const handleQuestToggle = (questKey, xpReward, dmg) => {
    if (gameState.bossDefeated && !gameState.completedQuests[questKey]) {
      // Allow completing quests even if boss is defeated to log daily streak/XP
    }

    const today = new Date().toISOString().split('T')[0];
    const isChecking = !gameState.completedQuests[questKey];

    setGameState(prev => {
      const updatedQuests = { ...prev.completedQuests, [questKey]: isChecking };
      
      // Calculate new Boss HP
      let newBossHp = prev.bossHp;
      let newlyDefeated = prev.bossDefeated;
      let inventory = [...prev.inventory];

      if (isChecking) {
        newBossHp = Math.max(0, prev.bossHp - dmg);
        setIsBossShaking(true);
        setTimeout(() => setIsBossShaking(false), 500);
        spawnFloatingText(`-${dmg} HP`, 'damage', bossRef);
        spawnFloatingText(`+${xpReward} XP`, 'xp', bossRef);

        if (newBossHp === 0 && !prev.bossDefeated) {
          newlyDefeated = true;
          // Award boss defeat XP and random item drop
          spawnFloatingText("+50 Boss Defeated XP!", 'xp', bossRef);
          
          const unownedItems = INVENTORY_ITEMS.filter(item => !prev.inventory.includes(item.id));
          if (unownedItems.length > 0) {
            const item = unownedItems[Math.floor(Math.random() * unownedItems.length)];
            inventory.push(item.id);
            setLootNotification(item);
            setTimeout(() => setLootNotification(null), 5000);
          }
        }
      }

      // Calculate streak
      let streak = prev.streak;
      let lastQuestCompletedDate = prev.lastQuestCompletedDate;

      if (isChecking) {
        if (!prev.lastQuestCompletedDate) {
          streak = 1;
        } else if (prev.lastQuestCompletedDate === today) {
          // already done a quest today, keep streak as is
        } else {
          const lastDate = new Date(prev.lastQuestCompletedDate);
          const currentDate = new Date(today);
          const diffTime = Math.abs(currentDate - lastDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            streak += 1;
          } else {
            streak = 1; // reset streak if gap is larger
          }
        }
        lastQuestCompletedDate = today;
      }

      // Consistency heatmap: quests completed per calendar day
      const questHistory = { ...(prev.questHistory || {}) };
      questHistory[today] = Math.max(0, (questHistory[today] || 0) + (isChecking ? 1 : -1));

      // Update stat categories
      const statMap = {
        sizing: 'sizing',
        journal: 'journal',
        noOvertrade: 'noOvertrade',
        noRevenge: 'noRevenge',
        calmness: 'calmness'
      };
      const statKey = statMap[questKey];
      const updatedStats = { ...prev.stats };
      if (isChecking && statKey) {
        updatedStats[statKey] = Math.min(100, prev.stats[statKey] + 1);
      }

      let nextState = {
        ...prev,
        completedQuests: updatedQuests,
        questHistory,
        bossHp: newBossHp,
        bossDefeated: newlyDefeated,
        streak,
        lastQuestCompletedDate,
        inventory,
        stats: updatedStats
      };

      if (isChecking) {
        nextState = addXp(xpReward, nextState);
        if (newBossHp === 0 && !prev.bossDefeated) {
          nextState = addXp(50, nextState); // Boss bonus XP
        }
      }

      return nextState;
    });
  };

  // --- Auto-verified quests: the app checks what it can see itself. ---
  // These only ever CHECK a quest (never un-check), and route through the
  // normal handleQuestToggle XP/damage path.
  const questsRef = useRef(gameState.completedQuests);
  questsRef.current = gameState.completedQuests;

  // Made today's market call (PredictionContext knows)
  useEffect(() => {
    if (predictionToday?.your_choice && !questsRef.current.dailyCall) {
      handleQuestToggle('dailyCall', 20, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionToday?.your_choice]);

  // Planned a trade in the Position Sizing calculator today
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let stamped = null;
    try { stamped = localStorage.getItem(SIZED_KEY); } catch { /* private mode */ }
    if (stamped === todayStr && !questsRef.current.sizing) {
      handleQuestToggle('sizing', 20, 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogMood = (e) => {
    e.preventDefault();
    const today = new Date().toISOString().split('T')[0];

    if (gameState.lastMoodDate === today) {
      setMoodMsg('Already logged today — keep maintaining discipline!');
      return;
    }
    setMoodMsg('');

    setGameState(prev => {
      const moodLogs = [...prev.moodLogs, { date: today, mood: moodInput, note: moodNote }];
      const newlyDefeated = prev.bossDefeated || prev.bossHp <= 10;
      const newBossHp = Math.max(0, prev.bossHp - 10);
      
      setIsBossShaking(true);
      setTimeout(() => setIsBossShaking(false), 500);
      spawnFloatingText(`-10 HP`, 'damage', bossRef);
      spawnFloatingText(`+10 XP`, 'xp', bossRef);

      let updatedStats = { ...prev.stats, calmness: Math.min(100, prev.stats.calmness + 2) };

      let nextState = {
        ...prev,
        moodLogs,
        lastMoodDate: today,
        bossHp: newBossHp,
        bossDefeated: newlyDefeated,
        stats: updatedStats
      };

      nextState = addXp(10, nextState);
      if (newBossHp === 0 && !prev.bossDefeated) {
        nextState = addXp(50, nextState);
      }

      return nextState;
    });

    setMoodNote("");
  };

  const handleSaveJournal = (e) => {
    e.preventDefault();
    if (!journalInput.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    const newLog = {
      id: Date.now(),
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      entry: journalInput,
      mood: moodInput,
      tags: Object.keys(journalTags).filter(t => journalTags[t])
    };

    setGameState(prev => {
      const journalLogs = [newLog, ...prev.journalLogs];
      
      let nextState = {
        ...prev,
        journalLogs
      };

      // If first journal of the day, award XP & deal damage to Boss
      if (prev.lastJournalDate !== today) {
        const newlyDefeated = prev.bossDefeated || prev.bossHp <= 20;
        const newBossHp = Math.max(0, prev.bossHp - 20);

        setIsBossShaking(true);
        setTimeout(() => setIsBossShaking(false), 500);
        spawnFloatingText(`-20 HP`, 'damage', bossRef);
        spawnFloatingText(`+30 XP`, 'xp', bossRef);

        let updatedStats = { 
          ...prev.stats, 
          journal: Math.min(100, prev.stats.journal + 5) 
        };

        nextState = {
          ...nextState,
          lastJournalDate: today,
          bossHp: newBossHp,
          bossDefeated: newlyDefeated,
          stats: updatedStats
        };

        nextState = addXp(30, nextState);
        if (newBossHp === 0 && !prev.bossDefeated) {
          nextState = addXp(50, nextState);
        }
      } else {
        // Just standard log without daily XP
        spawnFloatingText("Journal Logged!", 'xp', bossRef);
      }

      return nextState;
    });

    setJournalInput("");
    setJournalTags({ sizing: false, overtrade: false, revenge: false, setup: false });

    // Writing a real entry IS the journal quest — auto-check it (verified).
    if (!gameState.completedQuests.journal) {
      handleQuestToggle('journal', 20, 20);
    }
  };

  const handleEquipItem = (itemId) => {
    setGameState(prev => {
      const equippedItemId = prev.equippedItemId === itemId ? null : itemId;
      return { ...prev, equippedItemId };
    });
  };

  const saveName = () => {
    setGameState(prev => ({ ...prev, avatarName: nameInput }));
    setEditNameMode(false);
  };

  const exportState = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `alphanova_discipline_state_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importState = (e) => {
    const fileReader = new FileReader();
    fileReader.onload = event => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.level && parsed.xp !== undefined) {
          setGameState(applyDailyReset({ ...DEFAULT_STATE, ...parsed }));
          setImportMsg({ ok: true, text: 'Discipline state imported successfully.' });
        } else {
          setImportMsg({ ok: false, text: 'Invalid state file structure.' });
        }
      } catch {
        setImportMsg({ ok: false, text: 'Could not parse that file — use a JSON backup exported from the Discipline Arena.' });
      }
      setTimeout(() => setImportMsg(null), 6000);
    };
    if (e.target.files[0]) {
      fileReader.readAsText(e.target.files[0]);
    }
  };

  // Two-step inline confirm (no native confirm() — it blocks and can't be styled)
  const resetState = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    clearTimeout(resetTimerRef.current);
    setConfirmReset(false);
    setGameState(applyDailyReset({ ...DEFAULT_STATE }));
    localStorage.removeItem('alphanova_trading_game_state');
  };

  // Get active item details
  const equippedItem = INVENTORY_ITEMS.find(item => item.id === gameState.equippedItemId);

  // Stats bonuses computation
  const getModifiedStat = (statKey) => {
    let base = gameState.stats[statKey] || 20;
    if (equippedItem) {
      if (statKey === 'sizing' && equippedItem.id === 'shield') base += 10;
      if (statKey === 'sizing' && equippedItem.id === 'ruler') base += 15;
      if (statKey === 'noOvertrade' && equippedItem.id === 'elixir') base += 15;
      if (statKey === 'journal' && equippedItem.id === 'ledger') base += 10;
      if (statKey === 'calmness' && equippedItem.id === 'amulet') base += 15;
      if (statKey === 'calmness' && equippedItem.id === 'compass') base += 10;
    }
    return Math.min(100, base);
  };

  return (
    <div className="game-container" style={{ paddingBottom: '60px' }}>
      
      {/* Floating Texts Container */}
      {floatingTexts.map(t => (
        <div 
          key={t.id} 
          className="floating-indicator" 
          style={{ 
            left: `${t.x}px`, 
            top: `${t.y}px`, 
            color: t.type === 'damage' ? '#FF453A' : '#D4AF37',
            textShadow: t.type === 'damage' ? '0 0 8px rgba(255, 69, 58, 0.5)' : '0 0 8px rgba(212, 175, 55, 0.5)'
          }}
        >
          {t.text}
        </div>
      ))}

      {/* Level Up Celebration Modal */}
      {showLevelUp && (
        <div className="level-up-modal">
          <div className="level-up-box">
            <h1 style={{ color: 'var(--primary-gold)', fontSize: '42px', marginBottom: '8px' }}>LEVEL UP!</h1>
            <div style={{ fontSize: '80px', margin: '20px 0' }}>🏆</div>
            <h3 style={{ fontSize: '24px', marginBottom: '12px' }}>You reached Level {gameState.level}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
              Your mental discipline is strengthening. You are rising to the rank of <strong style={{ color: 'var(--text-primary)' }}>{getRankName(gameState.level)}</strong>!
            </p>
            <button onClick={() => setShowLevelUp(false)}>Continue Quest</button>
          </div>
        </div>
      )}

      {/* Loot item notification */}
      {lootNotification && (
        <div className="loot-notification">
          <div style={{ fontSize: '30px' }}>{lootNotification.emoji}</div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--primary-gold)', fontWeight: 700, textTransform: 'uppercase' }}>New Loot Discovered!</div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{lootNotification.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Added to your Inventory bag.</div>
          </div>
        </div>
      )}

      {/* Header Area */}
      <PageHeader
        code="ARENA"
        title="Discipline Arena"
        subtitle="Gamify your psychology, risk controls, and trading consistency."
        right={
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="secondary" style={{ width: 'auto', padding: '10px 16px', fontSize: '13px' }} onClick={exportState}>
            Backup State
          </button>
          <label className="secondary" style={{ width: 'auto', padding: '10px 16px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: 0 }}>
            Restore
            <input type="file" accept=".json" onChange={importState} style={{ display: 'none' }} />
          </label>
          <button className="secondary" style={{ width: 'auto', padding: '10px 16px', fontSize: '13px', borderColor: confirmReset ? 'var(--red-loss)' : 'rgba(255,69,58,0.2)', color: 'var(--red-loss)' }} onClick={resetState}>
            {confirmReset ? 'Tap again to wipe' : 'Reset'}
          </button>
        </div>
        }
      />

      {importMsg && (
        <div className={`arena-msg ${importMsg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 16 }}>{importMsg.text}</div>
      )}

      <div className="game-grid">
        {/* ================= LEFT COLUMN: HERO PANEL ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Avatar Profile Card */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{ 
                  width: '90px', 
                  height: '90px', 
                  borderRadius: '50%', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '2px solid var(--primary-gold)', 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '44px',
                  boxShadow: '0 0 15px rgba(212, 175, 55, 0.2)'
                }}>
                  {equippedItem ? equippedItem.emoji : "🧙‍♂️"}
                </div>
                {gameState.streak > 0 && (
                  <div className="streak-badge" style={{ position: 'absolute', bottom: '-8px', right: '-12px' }}>
                    🔥 {gameState.streak}d
                  </div>
                )}
              </div>

              {editNameMode ? (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
                  <input 
                    type="text" 
                    value={nameInput} 
                    onChange={(e) => setNameInput(e.target.value)} 
                    style={{ padding: '6px 10px', width: '150px', marginBottom: 0 }}
                  />
                  <button onClick={saveName} style={{ width: 'auto', padding: '6px 12px' }}>Save</button>
                </div>
              ) : (
                <h3 style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {gameState.avatarName}
                  <span 
                    onClick={() => setEditNameMode(true)} 
                    style={{ fontSize: '13px', cursor: 'pointer', opacity: 0.6 }}
                  >
                    ✏️
                  </span>
                </h3>
              )}
              
              <div style={{ color: 'var(--primary-gold)', fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                Level {gameState.level} • {getRankName(gameState.level)}
              </div>
            </div>

            {/* XP bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>XP Progress</span>
                <span>{gameState.xp} / {getXpThreshold(gameState.level)} XP</span>
              </div>
              <div className="xp-bar-container">
                <div className="xp-bar-fill" style={{ width: `${(gameState.xp / getXpThreshold(gameState.level)) * 100}%` }}></div>
              </div>
            </div>

            {/* Character stats */}
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Character Attributes</h4>
              
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>🛡️ Sizing Mastery</span>
                  <span style={{ fontWeight: 600 }}>{getModifiedStat('sizing')}%</span>
                </div>
                <div className="stat-prog-bar">
                  <div className="stat-prog-fill" style={{ width: `${getModifiedStat('sizing')}%`, backgroundColor: '#32D74B' }}></div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>📜 Journal Mastery</span>
                  <span style={{ fontWeight: 600 }}>{getModifiedStat('journal')}%</span>
                </div>
                <div className="stat-prog-bar">
                  <div className="stat-prog-fill" style={{ width: `${getModifiedStat('journal')}%`, backgroundColor: 'var(--primary-accent)' }}></div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>⏳ Patience (No Overtrade)</span>
                  <span style={{ fontWeight: 600 }}>{getModifiedStat('noOvertrade')}%</span>
                </div>
                <div className="stat-prog-bar">
                  <div className="stat-prog-fill" style={{ width: `${getModifiedStat('noOvertrade')}%`, backgroundColor: '#BF5AF2' }}></div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>💎 Calmness (No Revenge)</span>
                  <span style={{ fontWeight: 600 }}>{getModifiedStat('noRevenge')}%</span>
                </div>
                <div className="stat-prog-bar">
                  <div className="stat-prog-fill" style={{ width: `${getModifiedStat('noRevenge')}%`, backgroundColor: '#FF9F0A' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory bag Card */}
          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Equipment & Loot</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>Defeat bosses to earn gear. Click to equip passive buffs.</p>
            
            {gameState.inventory.length === 0 ? (
              <div style={{ padding: '24px 12px', border: '1px dashed var(--border-color)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Your inventory bag is currently empty.<br/>Defeat daily bosses to secure loot drops!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {gameState.inventory.map(itemId => {
                  const item = INVENTORY_ITEMS.find(i => i.id === itemId);
                  if (!item) return null;
                  const isEquipped = gameState.equippedItemId === item.id;
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => handleEquipItem(item.id)}
                      className={`inventory-slot ${isEquipped ? 'equipped-glow' : ''}`}
                      title={`${item.name}: ${item.description}`}
                      style={{
                        padding: '12px',
                        background: isEquipped ? 'rgba(212, 175, 55, 0.08)' : 'rgba(255,255,255,0.02)',
                        border: isEquipped ? '1px solid var(--primary-gold)' : '1px solid var(--border-color)',
                        borderRadius: '12px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontSize: '32px' }}>{item.emoji}</div>
                      <div style={{ fontSize: '10px', marginTop: '6px', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{item.name}</div>
                      {isEquipped && (
                        <div style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: 'var(--primary-gold)',
                          color: '#000',
                          borderRadius: '50%',
                          width: '12px',
                          height: '12px',
                          fontSize: '8px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>E</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {equippedItem && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(212, 175, 55, 0.05)', border: '1px solid rgba(212, 175, 55, 0.15)', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary-gold)' }}>Active Buff: {equippedItem.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{equippedItem.description}</div>
              </div>
            )}
          </div>
        </div>

        {/* ================= MIDDLE COLUMN: ARENA & QUESTS ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Boss Battle Arena Card */}
          <div ref={bossRef} className={`boss-card ${isBossShaking ? 'shake' : ''}`}>
            {gameState.bossDefeated ? (
              <div style={{ padding: '20px 0' }}>
                <div style={{ fontSize: '72px', animation: 'scaleIn 0.5s' }}>🏆</div>
                <h2 style={{ color: 'var(--green-gain)', marginTop: '12px' }}>Demon Slain!</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '300px', margin: '0 auto 20px auto' }}>
                  You defeated {currentBoss.name} for today. Your discipline remains unbroken!
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--primary-gold)', padding: '6px 14px', borderRadius: '12px', color: 'var(--primary-gold)', fontSize: '13px', fontWeight: 600 }}>
                  👑 Boss Defeated Loot Claimed
                </div>
              </div>
            ) : (
              <>
                <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', color: '#FF453A', fontWeight: 600 }}>
                  Daily Threat
                </div>
                
                <h3 style={{ fontSize: '18px', color: currentBoss.color }}>{currentBoss.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 16px 0', padding: '0 20px' }}>
                  {currentBoss.description}
                </p>

                <div className="boss-emoji">{currentBoss.emoji}</div>

                <div className="boss-hp-bar">
                  <div className="boss-hp-fill" style={{ width: `${(gameState.bossHp / currentBoss.maxHp) * 100}%` }}></div>
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)'
                  }}>
                    HP: {gameState.bossHp} / {currentBoss.maxHp} ({(Math.round((gameState.bossHp / currentBoss.maxHp) * 100)) || 0}%)
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Complete daily check-in tasks to deal damage!
                </div>
              </>
            )}
          </div>

          {/* Daily Quests List */}
          <div className="card">
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Daily Discipline Quests</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '20px' }}>Tick off rules you have successfully followed in today's sessions.</p>

            <button 
              className={`quest-btn ${gameState.completedQuests.sizing ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('sizing', 20, 20)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Strict Position Sizing<span className="quest-auto" title="Auto-verifies when you plan a trade in the Position Sizing calculator">AUTO ✓</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Risked ≤ 1-2% capital per trade — checks itself when you use the sizing calculator.</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+20 XP</div>
            </button>

            <button 
              className={`quest-btn ${gameState.completedQuests.journal ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('journal', 20, 20)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>All Trades Journaled<span className="quest-auto" title="Auto-verifies when you save a journal entry below">AUTO ✓</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Checks itself when you save a real entry in the Discipline Journal.</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+20 XP</div>
            </button>

            <button 
              className={`quest-btn ${gameState.completedQuests.noOvertrade ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('noOvertrade', 25, 25)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Zero Overtrading</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Stayed strictly within daily limit (e.g. max 3 setups).</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+25 XP</div>
            </button>

            <button 
              className={`quest-btn ${gameState.completedQuests.noRevenge ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('noRevenge', 25, 25)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Zero Revenge Trading</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Did not chase. Stepped away from screen after hits.</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+25 XP</div>
            </button>

            <button
              className={`quest-btn ${gameState.completedQuests.calmness ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('calmness', 10, 10)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Emotional Calmness & Zen</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Acknowledge market variance without frustration.</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+10 XP</div>
            </button>

            <button
              className={`quest-btn ${gameState.completedQuests.dailyCall ? 'checked' : ''}`}
              onClick={() => handleQuestToggle('dailyCall', 20, 10)}
            >
              <div className="quest-checkbox"></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Made Today's Market Call<span className="quest-auto" title="Auto-verifies when you call NIFTY green/red on the Dashboard">AUTO ✓</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Commit to a view before the open — checks itself when you play Today's Call.</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-gold)' }}>+20 XP</div>
            </button>
          </div>

          {/* Consistency heatmap */}
          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Consistency</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px' }}>
              Quests completed per day, last 12 weeks. Discipline is the streak you can see.
            </p>
            <QuestHeatmap history={gameState.questHistory} />
          </div>
        </div>

        {/* ================= RIGHT COLUMN: MOOD & JOURNAL ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Mood Log Card */}
          <div className="card">
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Psychological Mood Logger</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>Rate your calm/happiness state before, during, or after trading.</p>

            <form onSubmit={handleLogMood}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '24px', opacity: moodInput === 1 ? 1 : 0.4, transition: 'opacity 0.2s', cursor: 'pointer' }} onClick={() => setMoodInput(1)}>😤</span>
                <span style={{ fontSize: '24px', opacity: moodInput === 2 ? 1 : 0.4, transition: 'opacity 0.2s', cursor: 'pointer' }} onClick={() => setMoodInput(2)}>😐</span>
                <span style={{ fontSize: '24px', opacity: moodInput === 3 ? 1 : 0.4, transition: 'opacity 0.2s', cursor: 'pointer' }} onClick={() => setMoodInput(3)}>😊</span>
                <span style={{ fontSize: '24px', opacity: moodInput === 4 ? 1 : 0.4, transition: 'opacity 0.2s', cursor: 'pointer' }} onClick={() => setMoodInput(4)}>😄</span>
                <span style={{ fontSize: '24px', opacity: moodInput === 5 ? 1 : 0.4, transition: 'opacity 0.2s', cursor: 'pointer' }} onClick={() => setMoodInput(5)}>🔥</span>
              </div>

              <input 
                type="range" 
                min="1" 
                max="5" 
                value={moodInput} 
                onChange={(e) => setMoodInput(parseInt(e.target.value))}
                style={{ marginBottom: '14px', cursor: 'pointer' }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '-10px', marginBottom: '16px' }}>
                <span>Highly Stressed</span>
                <span>Perfect Calm</span>
              </div>

              <label>Psychological Notes / State</label>
              <input 
                type="text" 
                placeholder="e.g. Felt FOMO but closed chart. Mind is clear." 
                value={moodNote}
                onChange={(e) => setMoodNote(e.target.value)}
                style={{ padding: '10px 12px', fontSize: '13px', marginBottom: '14px' }}
              />

              <button
                type="submit"
                disabled={gameState.lastMoodDate === new Date().toISOString().split('T')[0]}
                style={{ fontSize: '13px', padding: '10px' }}
              >
                {gameState.lastMoodDate === new Date().toISOString().split('T')[0] ? "Mood Logged Today" : "Log Mood & Deal 10 Damage"}
              </button>
              {moodMsg && <div className="arena-msg ok">{moodMsg}</div>}
            </form>

            {gameState.moodLogs.length > 1 && (
              <div className="arena-mood-trend">
                <span className="arena-mood-trend-label">
                  Mood trend · avg {(
                    gameState.moodLogs.slice(-30).reduce((a, m) => a + (m.mood || 0), 0)
                    / gameState.moodLogs.slice(-30).length
                  ).toFixed(1)}/5
                </span>
                <span className="arena-mood-trend-chart">
                  <Sparkline
                    values={gameState.moodLogs.slice(-30).map((m) => m.mood)}
                    stroke="#F5DC8C"
                    width={180}
                    height={30}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Discipline Journal Card */}
          <div className="card">
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Discipline Journal</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>Log lessons, rule breaks, or personal wins. Daily first log awards +30 XP.</p>

            <form onSubmit={handleSaveJournal}>
              <label>Journal Notes</label>
              <textarea 
                placeholder="Write reflection... (e.g. accepted minor stop-loss immediately, kept position size small. Very happy with execution.)"
                value={journalInput}
                onChange={(e) => setJournalInput(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '80px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'none',
                  marginBottom: '12px'
                }}
              />

              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Attach Tags:</span>
                <span 
                  className={`tag-pill ${journalTags.sizing ? 'active' : ''}`}
                  onClick={() => setJournalTags(prev => ({ ...prev, sizing: !prev.sizing }))}
                >
                  Sizing
                </span>
                <span 
                  className={`tag-pill ${journalTags.overtrade ? 'active' : ''}`}
                  onClick={() => setJournalTags(prev => ({ ...prev, overtrade: !prev.overtrade }))}
                >
                  Overtrade
                </span>
                <span 
                  className={`tag-pill ${journalTags.revenge ? 'active' : ''}`}
                  onClick={() => setJournalTags(prev => ({ ...prev, revenge: !prev.revenge }))}
                >
                  Revenge
                </span>
                <span 
                  className={`tag-pill ${journalTags.setup ? 'active' : ''}`}
                  onClick={() => setJournalTags(prev => ({ ...prev, setup: !prev.setup }))}
                >
                  Setup Check
                </span>
              </div>

              <button type="submit" style={{ fontSize: '13px', padding: '10px' }}>
                Save Journal Entry
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* ================= BOTTOM ROW: HISTORY FEED ================= */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Discipline Logs History</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px' }}>A historical feed of your mental state and trading notes.</p>

        {gameState.journalLogs.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {['all', 'sizing', 'overtrade', 'revenge', 'setup'].map((tag) => {
              const count = tag === 'all'
                ? gameState.journalLogs.length
                : gameState.journalLogs.filter((l) => (l.tags || []).includes(tag)).length;
              if (tag !== 'all' && count === 0) return null;
              return (
                <span
                  key={tag}
                  className={`tag-pill ${journalFilter === tag ? 'active' : ''}`}
                  onClick={() => setJournalFilter(tag)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setJournalFilter(tag); }}
                >
                  {tag === 'all' ? 'All' : `#${tag}`} ({count})
                </span>
              );
            })}
          </div>
        )}

        {gameState.journalLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            No journal entries recorded yet. Complete your first journal note to begin!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '400px', overflowY: 'auto', paddingRight: '6px' }}>
            {(journalFilter === 'all'
              ? gameState.journalLogs
              : gameState.journalLogs.filter((l) => (l.tags || []).includes(journalFilter))
            ).map(log => (
              <div 
                key={log.id}
                style={{
                  padding: '16px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>
                      {log.mood === 1 && "😤"}
                      {log.mood === 2 && "😐"}
                      {log.mood === 3 && "😊"}
                      {log.mood === 4 && "😄"}
                      {log.mood === 5 && "🔥"}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{log.date} @ {log.time}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {log.tags && log.tags.map(tag => (
                      <span key={tag} style={{ fontSize: '10px', background: 'rgba(62, 230, 255, 0.1)', color: 'var(--primary-accent)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                  {log.entry}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingGame;
