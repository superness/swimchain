/**
 * Budget Meter Component
 *
 * Displays daily PoW budget usage.
 */

import { useState, useEffect } from 'react';
import { getAutoEngageEngine } from '../services/AutoEngageEngine';
import './BudgetMeter.css';

export function BudgetMeter(): JSX.Element {
  const engine = getAutoEngageEngine();
  const [used, setUsed] = useState(engine.getUsedBudget());
  const [limit, setLimit] = useState(engine.getBudgetLimit());

  useEffect(() => {
    // Subscribe to budget state changes instead of polling
    const unsubscribe = engine.subscribeToBudget((state) => {
      setUsed(state.used);
      setLimit(state.limit);
    });

    return unsubscribe;
  }, [engine]);

  const remaining = limit - used;
  const usedPercent = limit > 0 ? (used / limit) * 100 : 0;

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="budget-meter" role="progressbar" aria-valuenow={used} aria-valuemax={limit}>
      <div className="budget-meter__header">
        <span className="budget-meter__label">Daily PoW Budget</span>
        <span className="budget-meter__value">
          {formatTime(remaining)} remaining
        </span>
      </div>
      <div className="budget-meter__bar">
        <div
          className="budget-meter__fill"
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <div className="budget-meter__footer">
        <span className="budget-meter__used">
          Used: {formatTime(used)}
        </span>
        <span className="budget-meter__limit">
          Limit: {formatTime(limit)}
        </span>
      </div>
    </div>
  );
}
