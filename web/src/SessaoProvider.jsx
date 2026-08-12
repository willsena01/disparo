import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import { authApi } from './api/auth.js';

const Contexto = createContext(null);
export const useSessao = () => useContext(Contexto);

// Portão de entrada do painel: enquanto não há sessão, nenhuma tela é montada.
//
// Não é a segurança de verdade — essa está no middleware do servidor, que
// devolve 401 mesmo se alguém montar as telas na marra. Aqui é só para o
// usuário não ver uma interface inteira de erros de 401.
export default function SessaoProvider({ children }) {
  const [estado, setEstado] = useState({ carregando: true, user: null, configurado: true });

  const carregar = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setEstado({ carregando: false, user, configurado: true });
    } catch {
      // 401 é o caso normal de quem ainda não entrou; aqui só precisamos saber
      // se a tela deve oferecer "entrar" ou "criar a primeira conta".
      let configurado = true;
      try {
        configurado = (await authApi.status()).configurado;
      } catch {
        // API fora do ar: assume configurado e deixa o login mostrar o erro.
      }
      setEstado({ carregando: false, user: null, configurado });
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function sair() {
    try { await authApi.logout(); } catch { /* já expirou: seguir mesmo assim */ }
    setEstado((e) => ({ ...e, user: null }));
  }

  if (estado.carregando) {
    return (
      <div className="carregando">
        <span className="pulsa" aria-hidden="true" />
        <span className="sr">Carregando…</span>
        <style>{`
          .carregando { min-height: 100vh; display: grid; place-items: center; background: var(--bg); }
          .pulsa { width: 28px; height: 28px; border-radius: 9px; background: var(--surface-2); animation: p 1.1s ease infinite; }
          @keyframes p { 50% { opacity: 0.45; } }
          .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        `}</style>
      </div>
    );
  }

  if (!estado.user) {
    return (
      <Login
        configurado={estado.configurado}
        onEntrou={(user) => setEstado({ carregando: false, user, configurado: true })}
      />
    );
  }

  return (
    <Contexto.Provider value={{ user: estado.user, sair, recarregar: carregar }}>
      {children}
    </Contexto.Provider>
  );
}
