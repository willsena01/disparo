import { useEffect, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function Layout({ title, children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('disparo-theme') || 'system'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('disparo-theme', theme);
  }, [theme]);

  function toggleTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-col">
        <Topbar title={title} theme={theme} onToggleTheme={toggleTheme} />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
