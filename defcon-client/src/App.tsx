import { useState } from 'react';
import { Hero } from './Hero';
import { RunANode } from './RunANode';
import { BrowserJoin } from './BrowserJoin';
import { Wall } from './Wall';
import { KeyDownload } from './KeyDownload';

export function App() {
  const [joined, setJoined] = useState(false);

  return (
    <div className="page">
      <header className="site">
        <span className="mark">
          swimchain<span className="tld">.io</span> / defcon
        </span>
      </header>
      <div className="wrap">
        <Hero />
        <RunANode />
        {joined ? <Wall /> : <BrowserJoin onJoined={() => setJoined(true)} />}
        <KeyDownload />
      </div>
    </div>
  );
}
