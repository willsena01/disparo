import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Pages from './pages/Pages.jsx';
import Leads from './pages/Leads.jsx';
import Broadcasts from './pages/Broadcasts.jsx';
import Templates from './pages/Templates.jsx';
import FlowEditor from './pages/FlowEditor.jsx';
import Comments from './pages/Comments.jsx';
import Settings from './pages/Settings.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

const stubs = [
  ['/whatsapp', 'WhatsApp'],
  ['/facebook', 'Facebook'],
  ['/instagram', 'Contas do Instagram'],
  ['/push', 'Push'],
  ['/galeria', 'Galeria'],
  ['/links', 'Links'],
  ['/cobranca', 'Plano & Cobrança'],
  ['/indicacoes', 'Indicações'],
  ['/notificacoes', 'Notificações'],
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/relatorios" element={<Reports />} />
      <Route path="/paginas" element={<Pages />} />
      <Route path="/leads" element={<Leads />} />
      <Route path="/broadcasts" element={<Broadcasts />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/fluxos" element={<FlowEditor />} />
      <Route path="/comentarios" element={<Comments />} />
      <Route path="/configuracoes" element={<Settings />} />
      {stubs.map(([path, title]) => (
        <Route key={path} path={path} element={<ComingSoon title={title} />} />
      ))}
    </Routes>
  );
}
