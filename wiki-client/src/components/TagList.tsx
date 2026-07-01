/**
 * Tag display and editing component.
 * Shows tags as colored pills. Supports add/remove when editable.
 * Tags link to search results filtered by tag.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './TagList.css';

interface TagListProps {
  tags: string[];
  editable?: boolean;
  onTagsChange?: (tags: string[]) => void;
}

export function TagList({ tags, editable = false, onTagsChange }: TagListProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();

  const handleTagClick = useCallback(
    (tag: string) => {
      navigate(`/search?q=${encodeURIComponent(`tag:${tag}`)}`);
    },
    [navigate]
  );

  const handleAddTag = useCallback(() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onTagsChange?.([...tags, trimmed]);
    setInputValue('');
  }, [inputValue, tags, onTagsChange]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange?.(tags.filter((t) => t !== tagToRemove));
    },
    [tags, onTagsChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag-pill">
          <button
            type="button"
            className="tag-pill-label"
            onClick={() => handleTagClick(tag)}
            title={`Search for tag: ${tag}`}
          >
            {tag}
          </button>
          {editable && (
            <button
              type="button"
              className="tag-pill-remove"
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove tag ${tag}`}
            >
              x
            </button>
          )}
        </span>
      ))}

      {editable && (
        <div className="tag-input-wrapper">
          <input
            type="text"
            className="tag-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tag..."
            maxLength={50}
          />
          <button
            type="button"
            className="tag-add-btn"
            onClick={handleAddTag}
            disabled={!inputValue.trim()}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
