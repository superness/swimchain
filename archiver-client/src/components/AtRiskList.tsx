/**
 * At-Risk Content List Component
 *
 * Displays a list of content at risk of decay with urgency indicators.
 */

import { useState } from 'react';
import type { AtRiskContent } from '../types';
import { EngageButton } from './EngageButton';
import './AtRiskList.css';

interface AtRiskListProps {
  content: AtRiskContent[];
}

export function AtRiskList({ content }: AtRiskListProps): JSX.Element {
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  const formatHeat = (heat: number): string => {
    return `${(heat * 100).toFixed(1)}%`;
  };

  const formatTimeRemaining = (date: Date): string => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff <= 0) return 'Decaying now';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `~${days}d remaining`;
    }
    if (hours > 0) {
      return `~${hours}h ${minutes}m remaining`;
    }
    return `~${minutes}m remaining`;
  };

  return (
    <ul className="at-risk-list" role="list" aria-label="Content at risk of decay">
      {content.map((item) => (
        <li
          key={item.postHash}
          className={`at-risk-item urgency-${item.urgency}`}
          aria-expanded={expandedHash === item.postHash}
        >
          <div
            className="at-risk-item__main"
            onClick={() =>
              setExpandedHash(
                expandedHash === item.postHash ? null : item.postHash
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedHash(
                  expandedHash === item.postHash ? null : item.postHash
                );
              }
            }}
            tabIndex={0}
            role="button"
          >
            <div className="at-risk-item__info">
              <span
                className={`urgency-badge urgency-badge--${item.urgency}`}
                aria-label={`Urgency: ${item.urgency}`}
              >
                {item.urgency}
              </span>
              <h3 className="at-risk-item__title">{item.title}</h3>
            </div>
            <div className="at-risk-item__meta">
              <span className="meta-item">
                <span className="meta-label">Heat:</span>
                <span className="meta-value heat-value">{formatHeat(item.heat)}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">Space:</span>
                <span className="meta-value">{item.spaceId}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">Replies:</span>
                <span className="meta-value">{item.replyCount}</span>
              </span>
              <span className="meta-item time-remaining">
                {formatTimeRemaining(item.estimatedDecayTime)}
              </span>
            </div>
          </div>

          {expandedHash === item.postHash && (
            <div className="at-risk-item__details">
              <div className="pool-status">
                <span className="pool-label">Pool Progress:</span>
                <div className="pool-bar">
                  <div
                    className="pool-bar__fill"
                    style={{
                      width: `${
                        (item.poolStatus.currentSeconds /
                          item.poolStatus.requiredSeconds) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <span className="pool-text">
                  {item.poolStatus.currentSeconds}s / {item.poolStatus.requiredSeconds}s
                  ({item.poolStatus.contributorCount} contributors)
                </span>
              </div>

              <div className="engage-actions">
                <EngageButton postHash={item.postHash} seconds={5} />
                <EngageButton postHash={item.postHash} seconds={15} />
                <EngageButton postHash={item.postHash} seconds={30} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
