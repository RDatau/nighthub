import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Buffer } from 'buffer';

// Ensure window.fetch has both a getter and setter to prevent "Cannot set property fetch of #<Window> which has only a getter"
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  try {
    let _fetch = window.fetch;
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!desc || desc.set === undefined) {
      Object.defineProperty(window, 'fetch', {
        get() {
          return _fetch;
        },
        set(val) {
          _fetch = val;
        },
        configurable: true,
        enumerable: true,
      });
    }
  } catch (_) {}
}

window.Buffer = window.Buffer || Buffer;
import App from './App.tsx';
import { SearchEngineMenu } from './components/SearchEngineMenu.tsx';
import { SearchSuggestionsDropdown } from './components/SearchSuggestionsDropdown.tsx';
import { PasswordsMenu } from './components/PasswordsMenu.tsx';
import { PasswordPromptMenu } from './components/PasswordPromptMenu.tsx';
import { FindInPage } from './components/FindInPage.tsx';
import { WebContextMenu } from './components/WebContextMenu.tsx';
import './index.css';

const params = new URLSearchParams(window.location.search);
const view = params.get('view');

if (view === 'search-menu') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SearchEngineMenu />
    </StrictMode>,
  );
} else if (view === 'search-suggestions') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SearchSuggestionsDropdown />
    </StrictMode>,
  );
} else if (view === 'passwords-menu') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PasswordsMenu />
    </StrictMode>,
  );
} else if (view === 'password-prompt') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PasswordPromptMenu />
    </StrictMode>,
  );
} else if (view === 'find-in-page') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <FindInPage />
    </StrictMode>,
  );
} else if (view === 'web-context-menu') {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WebContextMenu />
    </StrictMode>,
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
