import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { PageHeader, SectionTitle, DataTable, StatTile, StatGrid } from '../components/ui';
import { usePrediction } from '../PredictionContext';
import './Leaderboard.css';

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const nameCell = (r) => (
  <span className={r.is_you ? 'lb-you' : ''}>
    {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] + ' ' : ''}{r.name}{r.is_you ? ' (you)' : ''}
  </span>
);

const STREAK_COLS = [
  { key: 'rank', label: '#', render: (r) => r.rank },
  { key: 'name', label: 'Player', render: nameCell },
  { key: 'current_streak', label: 'Streak 🔥', align: 'right', render: (r) => r.current_streak },
  { key: 'longest_streak', label: 'Best', align: 'right', render: (r) => r.longest_streak },
  { key: 'accuracy', label: 'Acc %', align: 'right', render: (r) => (r.accuracy == null ? '—' : `${r.accuracy}%`) },
];

const ACC_COLS = [
  { key: 'rank', label: '#', render: (r) => r.rank },
  { key: 'name', label: 'Player', render: nameCell },
  { key: 'accuracy', label: 'Accuracy', align: 'right', render: (r) => (r.accuracy == null ? '—' : `${r.accuracy}%`) },
  { key: 'total_calls', label: 'Calls', align: 'right', render: (r) => r.total_calls },
  { key: 'current_streak', label: 'Streak 🔥', align: 'right', render: (r) => r.current_streak },
];

const Leaderboard = () => {
  const { stats } = usePrediction();
  const [board, setBoard] = useState('streak');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBoard = useCallback(async (which) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/leaderboard?board=${which}`, { headers: authHeader() });
      setData(res.data);
    } catch {
      setData({ top: [], you: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoard(board); }, [board, fetchBoard]);

  const cols = board === 'accuracy' ? ACC_COLS : STREAK_COLS;
  const top = data?.top || [];
  const you = data?.you;
  const youInTop = top.some((r) => r.is_you);
  const minCalls = data?.min_calls ?? 20;
  const myCalls = stats?.total_calls ?? 0;

  return (
    <div className="fade-in">
      <PageHeader
        code="NIFTY"
        title="Nifty Leaderboard"
        subtitle="Call NIFTY green or red each morning — build a streak, climb the board"
      />

      <StatGrid>
        <StatTile label="Current Streak" value={`🔥 ${stats?.current_streak ?? 0}`} />
        <StatTile label="Best Streak" value={stats?.longest_streak ?? 0} />
        <StatTile label="Accuracy" value={stats?.accuracy == null ? '—' : `${stats.accuracy}%`} />
        <StatTile label="Total Calls" value={stats?.total_calls ?? 0} />
      </StatGrid>

      <div className="lb-toggle">
        <button className={board === 'streak' ? 'active' : ''} onClick={() => setBoard('streak')}>Current Streak</button>
        <button
          className={board === 'accuracy' ? 'active' : ''}
          onClick={() => setBoard('accuracy')}
          title={`Shows players with ${minCalls}+ scored calls`}
        >
          Accuracy
        </button>
      </div>

      {board === 'accuracy' && (
        <p className="lb-hint">
          ⓘ The accuracy board only ranks players with at least {minCalls} scored calls — one
          call a day gets you there in about a month.
          {myCalls < minCalls
            ? ` You have ${myCalls}, so ${minCalls - myCalls} more to qualify.`
            : ' You qualify.'}
        </p>
      )}

      <DataTable
        columns={cols}
        rows={top}
        rowKey={(r) => `${r.rank}-${r.name}`}
        loading={loading}
        empty={
          <div className="ui-empty">
            <div className="ui-empty-icon">🏆</div>
            <div className="ui-empty-title">No one's on the board yet</div>
            <p className="ui-empty-body">
              {board === 'accuracy'
                ? `Make at least ${data?.min_calls ?? 20} calls to qualify for the accuracy board.`
                : 'Make your first call on the Dashboard to get on the board.'}
            </p>
          </div>
        }
      />

      {you && !youInTop && (
        <>
          <SectionTitle icon="📍">Your Rank</SectionTitle>
          <DataTable columns={cols} rows={[you]} rowKey={() => 'you'} />
        </>
      )}
    </div>
  );
};

export default Leaderboard;
