/**
 * Typing indicator component
 */

import { truncateAddress } from '../lib/utils';
import './TypingIndicator.css';

interface TypingIndicatorProps {
  typingUsers: string[];
}

export function TypingIndicator({
  typingUsers,
}: TypingIndicatorProps): JSX.Element | null {
  if (typingUsers.length === 0) {
    return null;
  }

  const getText = () => {
    if (typingUsers.length === 1) {
      return (
        <>
          <span className="typing-indicator__user">
            {truncateAddress(typingUsers[0]!, 6)}
          </span>
          {' is typing'}
        </>
      );
    }

    if (typingUsers.length === 2) {
      return (
        <>
          <span className="typing-indicator__user">
            {truncateAddress(typingUsers[0]!, 6)}
          </span>
          {' and '}
          <span className="typing-indicator__user">
            {truncateAddress(typingUsers[1]!, 6)}
          </span>
          {' are typing'}
        </>
      );
    }

    return 'Several people are typing';
  };

  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      <div className="typing-indicator__dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="typing-indicator__text">{getText()}</span>
    </div>
  );
}
