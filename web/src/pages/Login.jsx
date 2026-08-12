import { useState } from 'react';
import { authApi } from '../api/auth.js';

// Tela de entrada. Serve para dois momentos: o primeiro acesso (quando ainda
// não existe conta nenhuma) e o login do dia a dia.
export default function Login({ configurado, onEntrou }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const primeiroAcesso = !configurado;

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = primeiroAcesso
        ? await authApi.setup({ email, senha, nome })
        : await authApi.login(email, senha);
      onEntrou(r.user);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrada">
      <form className="card caixa" onSubmit={enviar}>
        <div className="marca">
          <span className="marca-icone" aria-hidden="true">◈</span>
          <span className="marca-nome">Disparo</span>
        </div>

        <div>
          <h1 className="titulo">{primeiroAcesso ? 'Criar sua conta' : 'Entrar'}</h1>
          <p className="sub">
            {primeiroAcesso
              ? 'Esta é a primeira conta do painel. Ela será a dona do workspace.'
              : 'Use o e-mail e a senha do painel.'}
          </p>
        </div>

        {primeiroAcesso && (
          <div className="field">
            <label htmlFor="l-nome">Seu nome</label>
            <input id="l-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
        )}

        <div className="field">
          <label htmlFor="l-email">E-mail</label>
          <input
            id="l-email" type="email" className="input" value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username" autoFocus required
          />
        </div>

        <div className="field">
          <label htmlFor="l-senha">Senha</label>
          <input
            id="l-senha" type="password" className="input" value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={primeiroAcesso ? 'new-password' : 'current-password'} required
          />
          {primeiroAcesso && <span className="field-hint">Pelo menos 8 caracteres.</span>}
        </div>

        {erro && <p className="erro">{erro}</p>}

        <button className="btn btn-dark entrar" type="submit" disabled={enviando || !email || !senha}>
          {enviando ? 'Aguarde…' : primeiroAcesso ? 'Criar conta e entrar' : 'Entrar'}
        </button>
      </form>

      <style>{`
        .entrada { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); }
        .caixa {
          width: 100%; max-width: 380px; padding: 28px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .marca { display: flex; align-items: center; gap: 8px; }
        .marca-icone {
          width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center;
          background: var(--accent); color: #fff; font-size: 13px;
        }
        .marca-nome { font-size: 14px; font-weight: 700; }
        .titulo { font-size: 19px; font-weight: 700; }
        .sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; line-height: 1.5; }
        .erro {
          font-size: 12.5px; color: var(--danger); background: var(--danger-soft);
          padding: 9px 11px; border-radius: 8px; line-height: 1.45;
        }
        .entrar { justify-content: center; margin-top: 2px; }
      `}</style>
    </div>
  );
}
