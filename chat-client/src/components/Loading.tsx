/**
 * Loading spinner component
 */

import './Loading.css';

interface LoadingProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Optional loading text */
  text?: string;
  /** Fill the container */
  fullScreen?: boolean;
}

export function Loading({
  size = 'md',
  text,
  fullScreen = false,
}: LoadingProps): JSX.Element {
  const content = (
    <div className={`loading loading--${size}`}>
      <div className="loading__spinner" role="status" aria-label="Loading">
        <div className="loading__dot" />
        <div className="loading__dot" />
        <div className="loading__dot" />
      </div>
      {text && <p className="loading__text">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="loading__fullscreen">{content}</div>;
  }

  return content;
}
