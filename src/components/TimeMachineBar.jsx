import React, { useState, useRef, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import { createTimeMachineController } from '../layers/timeMachine';

const TODAY = new Date().toISOString().split('T')[0];
const MIN_DATE = '2015-01-01';

export default function TimeMachineBar({ mapRef, onHideLive, onShowLive, inline }) {
  const [open, setOpen]     = useState(false);
  const [date, setDate]     = useState('');
  const [loading, setLoading] = useState(false);
  const [activeDate, setActiveDate] = useState('');
  const ctrlRef = useRef(null);

  const getMap = () => mapRef?.current;

  const ensureCtrl = () => {
    const map = getMap();
    if (!map) return null;
    if (!ctrlRef.current) ctrlRef.current = createTimeMachineController(map);
    return ctrlRef.current;
  };

  const activate = async (d) => {
    const ctrl = ensureCtrl();
    if (!ctrl) return;
    setLoading(true);
    await ctrl.activate(d, onHideLive, onShowLive);
    setActiveDate(d);
    setLoading(false);
  };

  const deactivate = () => {
    ctrlRef.current?.deactivate(onShowLive);
    setActiveDate('');
  };

  const close = () => { deactivate(); setOpen(false); };

  useEffect(() => () => { ctrlRef.current?.deactivate(); }, []);

  const handleDateChange = (e) => {
    const d = e.target.value;
    setDate(d);
    if (d && d >= MIN_DATE && d <= TODAY) activate(d);
  };

  if (!open) {
    if (inline) {
      return (
        <button className="tool-card-btn" onClick={() => setOpen(true)}>
          <Clock size={16} color="#bf5af2" />
          <div>
            <div className="tool-card-title" style={{ color: '#bf5af2' }}>Time Machine</div>
            <div className="tool-card-sub">View any past date</div>
          </div>
        </button>
      );
    }
    return (
      <button className="replay-fab tm-fab" onClick={() => setOpen(true)} title="Time Machine">
        <Clock size={17} />
        <span>Time Machine</span>
      </button>
    );
  }

  const wrapper = inline ? 'replay-bar-inline' : 'replay-bar glass tm-bar';

  return (
    <div className={wrapper}>
      <div className="replay-row">
        <Clock size={15} color="#bf5af2" />
        <span className="replay-title" style={{ color: '#bf5af2' }}>Time Machine</span>
        <button className="replay-close" onClick={close}><X size={14} /></button>
      </div>

      <div className="replay-row" style={{ gap: 10 }}>
        <input
          type="date"
          className="tm-date-input"
          value={date}
          min={MIN_DATE}
          max={TODAY}
          onChange={handleDateChange}
        />
        {loading && <span className="replay-spinner" />}
        {activeDate && !loading && (
          <button className="tm-exit-btn" onClick={deactivate}>Exit</button>
        )}
      </div>

      {activeDate && (
        <div className="tm-banner">
          🕰 Viewing: {new Date(activeDate + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
