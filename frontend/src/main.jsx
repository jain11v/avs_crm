import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Chrome/Firefox change a focused number input's value on mouse-wheel
// scroll, independent of whether the spinner arrows are shown (that's a
// separate CSS-only fix in index.css) — blurring it on wheel makes the
// page scroll normally instead of silently changing whatever amount field
// the cursor happens to be sitting over.
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'number') {
      el.blur();
    }
  },
  { passive: true }
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
