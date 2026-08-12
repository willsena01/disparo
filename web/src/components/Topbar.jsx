import { IconMoon, IconUser, IconLogout } from '../icons/index.jsx';
import { useSessao } from '../SessaoProvider.jsx';

export default function Topbar({ title, theme, onToggleTheme }) {
  const sessao = useSessao();

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>

      <div className="topbar-actions">
        <button
          className="icon-btn"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          <IconMoon size={17} />
        </button>

        <div className="account-chip">
          <span className="avatar">
            <IconUser size={15} />
          </span>
          <span className="account-email" title={sessao?.user?.email}>
            {sessao?.user?.email ?? '—'}
          </span>
        </div>

        <button className="icon-btn" type="button" aria-label="Sair" onClick={sessao?.sair}>
          <IconLogout size={17} />
        </button>
      </div>

      <style>{`
        .topbar {
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }
        .topbar-title {
          font-size: 15px;
          font-weight: 600;
        }
        .topbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          display: grid;
          place-items: center;
        }
        .icon-btn:hover {
          background: var(--surface-2);
          color: var(--ink);
        }
        .account-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px 5px 5px;
          border-radius: 999px;
          border: 1px solid var(--border);
          margin: 0 2px;
        }
        .avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--surface-2);
          color: var(--muted);
          display: grid;
          place-items: center;
        }
        .account-email {
          font-size: 12.5px;
          color: var(--muted);
        }
      `}</style>
    </header>
  );
}
