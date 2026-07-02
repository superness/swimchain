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
          // Focus new thread form
          document.getElementById('new-thread-title')?.focus();
          break;

        case 'r':
          // Focus reply form
          document.getElementById('quick-reply')?.focus();
          break;

        case 'e':
        case 'E':
          // Keyboard engagement no-op: prevent default, handler placeholder (B2)
          e.preventDefault();
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
    { key: 'n', description: 'New thread' },
    { key: 'r', description: 'Reply to thread' },
    { key: 'e', description: 'Engage +5 seconds' },
    { key: 'E', description: 'Engage +15 seconds' },
    { key: '/', description: 'Focus search' },
    { key: '?', description: 'Show this help' },
    { key: 'Backspace', description: 'Go back' },
    { key: 'Escape', description: 'Close modal' },
  ];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: var(--z-modal);
        }

        .modal-content {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--spacing-xl);
          max-width: 400px;
          width: 90%;
        }

        .modal-content h2 {
          margin: 0 0 var(--spacing-lg);
          font-size: var(--font-size-xl);
        }

        .shortcuts-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: var(--spacing-lg);
        }

        .shortcuts-table th,
        .shortcuts-table td {
          padding: var(--spacing-sm);
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }

        .shortcuts-table th {
          color: var(--color-text-tertiary);
          font-size: var(--font-size-sm);
        }

        .shortcuts-table kbd {
          display: inline-block;
          padding: 2px 8px;
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
        }

        .modal-content .btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
