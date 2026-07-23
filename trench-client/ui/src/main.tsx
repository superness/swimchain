import React from 'react';
import ReactDOM from 'react-dom/client';

// Placeholder root — Task 3 replaces this with the real <App/> (map, homestead,
// lantern scheduler). Keeps the scaffold buildable end-to-end before the UI lands.
const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <div>The Trench</div>
  </React.StrictMode>
);
