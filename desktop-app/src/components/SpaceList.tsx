import React from "react";
import { useSwimchain } from "../context/SwimchainContext";

interface Props {
  selectedSpace: string | null;
  onSelectSpace: (spaceId: string) => void;
}

export function SpaceList({ selectedSpace, onSelectSpace }: Props) {
  const { connected, spaces, refreshSpaces } = useSwimchain();

  if (!connected) {
    return (
      <div className="space-list">
        <div className="space-list-header">
          <h3>Spaces</h3>
        </div>
        <div className="space-list-empty">
          Waiting for node connection...
        </div>
      </div>
    );
  }

  return (
    <div className="space-list">
      <div className="space-list-header">
        <h3>Spaces</h3>
        <button onClick={refreshSpaces} className="refresh-btn" title="Refresh">
          ↻
        </button>
      </div>

      {spaces.length === 0 ? (
        <div className="space-list-empty">
          <p>No spaces yet.</p>
          <p className="hint">Create a space to get started!</p>
        </div>
      ) : (
        <ul className="space-list-items">
          {spaces.map((space) => (
            <li
              key={space.id}
              className={`space-item ${selectedSpace === space.id ? "selected" : ""}`}
              onClick={() => onSelectSpace(space.id)}
            >
              <span className="space-name">{space.name}</span>
              <span className="space-count">{space.post_count} posts</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
