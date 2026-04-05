import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, History } from 'lucide-react';
import { fetchReplayEvents, createReplayController } from '../layers/replayAnimator';

const YEARS = Array.from({ length: 10 }, (_, i) => 2024 - i); // 2024..2015
const SPEEDS = ['0.5', '1', '2', '5'];

export default function ReplayBar({ mapRef, onHideLive, onShowLive, inline }) {
  const [open, setOpen]       = useState(false);
  const [year, setYear]       = useState(2023);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed]     = useState('1');
  const [progress, setProgress] = useState(0);   // 0..1
  const [total, setTotal]     = useState(0);
  const [dateLabel, setDateLabel] = useState('');
  const [error, setError]     = useState('');
  const ctrlRef = useRef(null);

  const getMap = () => mapRef?.current?._mapRef?.current || mapRef?.current;

  const cleanup = () => {
    ctrlRef.current?.pause();
    ctrlRef.current?.destroy();
    ctrlRef.current = null;
    setPlaying(false); setProgress(0); setTotal(0); setDateLabel('');
    onShowLive?.();
  };

  const close = () => { cleanup(); setOpen(false); };

  const load = async () => {
    setError(''); setLoading(true);
    try {
      const map = getMap();
      if (!map) throw new Error('Map not ready');
      const evs = await fetchReplayEvents(year);
      if (!evs.length) { setError('No events found for this year.'); setLoading(false); return; }

      if (ctrlRef.current) ctrlRef.current.destroy();
      const ctrl = createReplayController(map);
      ctrl.load(evs);
      ctrl.setSpeed(speed);
      ctrl.setOnTick((idx, ev, tot) => {
        setProgress(idx / (tot - 1));
        setTotal(tot);
        setDateLabel(ev?.date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) || '');
      });
      ctrl.setOnDone(() => setPlaying(false));
      ctrlRef.current = ctrl;
      setTotal(evs.length);
      onHideLive?.();
    } catch (e) {
      setError('Failed to load events. Try again.');
      console.warn('[ReplayBar]', e);
    }
    setLoading(false);
  };

  const togglePlay = async () => {
    if (!ctrlRef.current) { await load(); }
    if (!ctrlRef.current) return;
    if (playing) { ctrlRef.current.pause(); setPlaying(false); }
    else         { ctrlRef.current.play();  setPlaying(true);  }
  };

  // Sync speed to controller
  useEffect(() => { ctrlRef.current?.setSpeed(speed); }, [speed]);

  // Reset when year changes
  useEffect(() => { if (ctrlRef.current) { cleanup(); } }, [year]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), []);

  const handleScrub = (e) => {
    const val = parseFloat(e.target.value);
    const idx = Math.round(val * (total - 1));
    ctrlRef.current?.seek(idx);
    setProgress(val);
  };

  if (!open) {
    // Inline mode: compact card button inside sidebar
    if (inline) {
      return (
        <button className="tool-card-btn" onClick={() => setOpen(true)}>
          <History size={16} color="var(--accent)" />
          <div>
            <div className="tool-card-title">Year Replay</div>
            <div className="tool-card-sub">Animate past events</div>
          </div>
        </button>
      );
    }
    return (
      <button className="replay-fab" onClick={() => setOpen(true)} title="Year Replay">
        <History size={17} />
        <span>Replay</span>
      </button>
    );
  }

  const wrapper = inline ? 'replay-bar-inline' : 'replay-bar glass';

  return (
    <div className={wrapper}>
      <div className="replay-row">
        <History size={15} color="var(--accent)" />
        <span className="replay-title">Year Replay</span>

        <select className="replay-select" value={year} onChange={e => setYear(Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="replay-speed-group">
          {SPEEDS.map(s => (
            <button key={s} className={`replay-speed-btn ${speed === s ? 'active' : ''}`}
              onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>

        <button className="replay-close" onClick={close}><X size={14} /></button>
      </div>

      <div className="replay-row" style={{ gap: 10 }}>
        <button className="replay-play-btn" onClick={togglePlay} disabled={loading}>
          {loading ? <span className="replay-spinner" /> : playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <input type="range" className="replay-scrubber" min={0} max={1} step={0.001}
          value={progress} onChange={handleScrub} disabled={!total} />

        <span className="replay-date">{dateLabel || (total ? `${total} events` : '—')}</span>
      </div>

      {error && <div className="replay-error">{error}</div>}
    </div>
  );
}
