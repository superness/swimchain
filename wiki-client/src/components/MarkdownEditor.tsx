/**
 * Split-pane markdown editor with toolbar and live preview.
 */

import { useRef, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import './MarkdownEditor.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  existingPages?: string[];
}

interface ToolbarAction {
  label: string;
  icon: string;
  prefix: string;
  suffix: string;
  placeholder: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'Bold', icon: 'B', prefix: '**', suffix: '**', placeholder: 'bold text' },
  { label: 'Italic', icon: 'I', prefix: '*', suffix: '*', placeholder: 'italic text' },
  { label: 'Heading', icon: 'H', prefix: '## ', suffix: '', placeholder: 'heading' },
  { label: 'Link', icon: '🔗', prefix: '[', suffix: '](url)', placeholder: 'link text' },
  { label: 'Code', icon: '`', prefix: '`', suffix: '`', placeholder: 'code' },
  { label: 'List', icon: '•', prefix: '- ', suffix: '', placeholder: 'list item' },
  { label: 'WikiLink', icon: '[[]]', prefix: '[[', suffix: ']]', placeholder: 'Page Name' },
];

export function MarkdownEditor({ value, onChange, existingPages = [] }: MarkdownEditorProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleToolbarClick = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end);
      const replacement = selected || action.placeholder;

      const before = value.slice(0, start);
      const after = value.slice(end);
      const newValue = before + action.prefix + replacement + action.suffix + after;
      onChange(newValue);

      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        const cursorStart = start + action.prefix.length;
        const cursorEnd = cursorStart + replacement.length;
        textarea.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [value, onChange]
  );

  return (
    <div className="markdown-editor">
      <div className="markdown-editor-toolbar">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.label}
            className="toolbar-btn"
            onClick={() => handleToolbarClick(action)}
            title={action.label}
            type="button"
          >
            <span className={action.label === 'Italic' ? 'toolbar-italic' : action.label === 'Bold' ? 'toolbar-bold' : ''}>
              {action.icon}
            </span>
          </button>
        ))}
      </div>

      <div className="markdown-editor-panes">
        <div className="editor-pane">
          <div className="pane-header">Edit</div>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            placeholder="Write your content in markdown..."
          />
        </div>

        <div className="preview-pane">
          <div className="pane-header">Preview</div>
          <div className="preview-content">
            {value ? (
              <MarkdownRenderer markdown={value} existingPages={existingPages} />
            ) : (
              <p className="preview-placeholder">Preview will appear here...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
