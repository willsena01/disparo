import { NavLink } from 'react-router-dom';
import {
  IconGrid,
  IconChart,
  IconMessage,
  IconFlow,
  IconBroadcast,
  IconTemplate,
  IconComment,
  IconLeads,
  IconWhatsapp,
  IconFacebook,
  IconInstagram,
  IconMail,
  IconGallery,
  IconLink,
  IconBilling,
  IconGift,
  IconBell,
  IconSettings,
  IconChevronDown,
  IconLayers,
} from '../icons/index.jsx';

const nav = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: IconGrid, end: true },
      { to: '/relatorios', label: 'Relatórios', icon: IconChart },
    ],
  },
  {
    label: 'Messenger',
    items: [
      { to: '/paginas', label: 'Páginas', icon: IconMessage },
      { to: '/fluxos', label: 'Fluxos', icon: IconFlow },
      { to: '/broadcasts', label: 'Broadcasts', icon: IconBroadcast },
      { to: '/templates', label: 'Templates', icon: IconTemplate },
      { to: '/comentarios', label: 'Comentários', icon: IconComment },
      { to: '/leads', label: 'Leads', icon: IconLeads },
    ],
  },
  {
    label: 'WhatsApp',
    items: [{ to: '/whatsapp', label: 'WhatsApp', icon: IconWhatsapp }],
  },
  {
    label: 'Facebook',
    items: [{ to: '/facebook', label: 'Facebook', icon: IconFacebook }],
  },
  {
    label: 'Instagram',
    items: [{ to: '/instagram', label: 'Contas', icon: IconInstagram, soon: true }],
  },
  {
    label: 'E-mail',
    items: [{ to: '/push', label: 'Push', icon: IconBell, soon: true }],
  },
  {
    label: 'Biblioteca',
    items: [
      { to: '/galeria', label: 'Galeria', icon: IconGallery },
      { to: '/links', label: 'Links', icon: IconLink },
    ],
  },
  {
    label: 'Conta',
    items: [
      { to: '/cobranca', label: 'Cobrança', icon: IconBilling },
      { to: '/indicacoes', label: 'Indicações', icon: IconGift },
      { to: '/notificacoes', label: 'Notificações', icon: IconBell },
      { to: '/configuracoes', label: 'Configurações', icon: IconSettings },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <IconLayers size={18} />
        </span>
        <span className="brand-name">Disparo</span>
      </div>

      <button className="workspace-switch" type="button">
        <span className="workspace-label">
          <span className="workspace-eyebrow">Workspace</span>
          <span className="workspace-name">Principal</span>
        </span>
        <IconChevronDown size={16} />
      </button>

      <nav className="sidebar-nav">
        {nav.map((group, i) => (
          <div className="nav-group" key={i}>
            {group.label && <p className="nav-group-label">{group.label}</p>}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  'nav-item' + (isActive ? ' active' : '') + (item.soon ? ' soon' : '')
                }
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.soon && <span className="soon-badge">em breve</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <style>{`
        .sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 18px 14px 20px;
          gap: 6px;
          overflow-y: auto;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 4px 8px 14px;
        }
        .brand-mark {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--accent);
          color: white;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
        .brand-name {
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .workspace-switch {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
          margin-bottom: 14px;
          color: var(--ink);
        }
        .workspace-label {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
        }
        .workspace-eyebrow {
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted-2);
        }
        .workspace-name {
          font-size: 13px;
          font-weight: 600;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }
        .nav-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .nav-group-label {
          font-size: 10.5px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted-2);
          padding: 6px 10px 4px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 7px;
          font-size: 13.5px;
          color: var(--muted);
          text-decoration: none;
        }
        .nav-item:hover {
          background: var(--surface-2);
          color: var(--ink);
        }
        .nav-item.active {
          background: var(--accent-soft);
          color: var(--accent-ink);
          font-weight: 600;
        }
        .nav-item.soon {
          color: var(--muted-2);
        }
        .soon-badge {
          margin-left: auto;
          font-size: 9.5px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 2px 5px;
          color: var(--muted-2);
        }
      `}</style>
    </aside>
  );
}
