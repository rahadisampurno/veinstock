import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.tagName === 'INPUT' && target.type === 'number') {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) {
      e.preventDefault();
    }
  }
});

window.onerror = function(msg, _url, _line, _col, error) {
  document.body.innerHTML = '<div style="color:red;padding:20px;font-family:monospace;background:white;z-index:9999;position:fixed;top:0;left:0;right:0;bottom:0;"><h3>APP CRASHED</h3><p>' + msg + '</p><pre>' + (error && error.stack) + '</pre></div>';
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
