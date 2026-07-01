/**
 * Keyboard navigation hook and provider
 * Implements shortcuts per CLIENT_DESIGN.md Section 3.4
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface KeyboardNavContextValue {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  items: string[];
  setItems: (items: string[]) => void;
  isShortcutsModalOpen: boolean;
  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
}

const KeyboardNavContext = createContext<KeyboardNavContextValue | null>(null);

interface KeyboardNavigationProviderProps {
  children: ReactNode;
}

export function KeyboardNavigationProvider({
  children,
}: KeyboardNavigationProviderProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [items, setItems] = useState<string[]>([]);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Reset selection on route change
  useEffect(() => {
    setSelectedIndex(0);
  }, [location.pathname]);

  const openShortcutsModal = useCallback(() => {
    setIsShortcutsModalOpen(true);
  }, []);

  const closeShortcutsModal = useCallback(() => {
    setIsShortcutsModalOpen(false);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input/textarea or modal is open
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
          // Move selection down
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          break;

        case 'k':
          // Move selection up
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;

        case 'Enter':
          // Open selected item
          if (items[selectedIndex]) {
            navigate(items[selectedIndex]);
          }
          break;

        case 'n':
          // Navigate to compose
          navigate('/compose');
          break;

        case 'r':
          // Focus reply form
          document.getElementById('quick-reply')?.focus();
          break;

        case '/':
          // Focus search
          e.preventDefault();
          document.getElementById('search-input')?.focus();
          break;

        case '?':
          // Show shortcuts modal
          openShortcutsModal();
          break;

        case 'Backspace':
          // Go back
          if (!isShortcutsModalOpen) {
            navigate(-1);
          }
          break;

        case 'Escape':
          // Close modal
          if (isShortcutsModalOpen) {
            closeShortcutsModal();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, navigate, isShortcutsModalOpen, openShortcutsModal, closeShortcutsModal]);

  const value = useMemo<KeyboardNavContextValue>(
    () => ({
      selectedIndex,
      setSelectedIndex,
      items,
      setItems,
      isShortcutsModalOpen,
      openShortcutsModal,
      closeShortcutsModal,
    }),
    [selectedIndex, items, isShortcutsModalOpen, openShortcutsModal, closeShortcutsModal]
  );

  return (
    <KeyboardNavContext.Provider value={value}>
      {children}
      {isShortcutsModalOpen && <KeyboardShortcutsModal onClose={closeShortcutsModal} />}
    </KeyboardNavContext.Provider>
  );
}

export function useKeyboardNavigation(): KeyboardNavContextValue {
  const context = useContext(KeyboardNavContext);
  if (!context) {
    throw new Error('useKeyboardNavigation must be used within a KeyboardNavigationProvider');
  }
  return context;
}

// Keyboard shortcuts modal
interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps): JSX.Element {
  const shortcuts = [
    { key: 'j', description: 'Move selection down' },
    { key: 'k', description: 'Move selection up' },
    { key: 'Enter', description: 'Open selected item' },
    { key: 'n', description: 'New post' },
    { key: 'r', description: 'Reply to post' },
    { key: '/', description: 'Focus search' },
    { key: '?', description: 'Show this help' },
    { key: 'Backspace', description: 'Go back' },
    { key: 'Escape', description: 'Close modal' },
  ];

  return (
    <div
      className="keyboard-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="keyboard-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <table className="shortcuts-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(({ key, description }) => (
              <tr key={key}>
                <td><kbd>{key}</kbd></td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
          autoFocus
        >
          Close
        </button>
      </div>

      <style>{`
        .keyboard-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .keyboard-modal-content {
          background: var(--card-bg, #ffffff);
          border: 1px solid var(--border-color, #e1e5eb);
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 400px;
          width: 90%;
        }

        .keyboard-modal-content h2 {
          margin: 0 0 1rem;
          font-size: 1.25rem;
          color: var(--text-primary, #212529);
        }

        .shortcuts-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }

        .shortcuts-table th,
        .shortcuts-table td {
          padding: 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color, #e1e5eb);
        }

        .shortcuts-table th {
          color: var(--text-secondary, #5a6169);
          font-size: 0.875rem;
        }

        .shortcuts-table kbd {
          display: inline-block;
          padding: 2px 8px;
          background: var(--bg-secondary, #f8f9fa);
          border: 1px solid var(--border-color, #e1e5eb);
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.875rem;
        }

        .keyboard-modal-content .btn {
          width: 100%;
        }

        @media (prefers-color-scheme: dark) {
          .keyboard-modal-content {
            background: var(--card-bg-dark, #1e1e1e);
            border-color: var(--border-color-dark, #333);
          }

          .keyboard-modal-content h2 {
            color: var(--text-primary-dark, #e5e7eb);
          }

          .shortcuts-table th {
            color: var(--text-secondary-dark, #9ca3af);
          }

          .shortcuts-table th,
          .shortcuts-table td {
            border-color: var(--border-color-dark, #333);
          }

          .shortcuts-table kbd {
            background: var(--bg-tertiary-dark, #252542);
            border-color: var(--border-color-dark, #444);
          }
        }
      `}</style>
    </div>
  );
}
