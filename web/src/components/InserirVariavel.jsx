import { useEffect, useState } from 'react';
import { flowsApi } from '../api/index.js';

// Menu de variáveis de personalização.
//
// Sem isso a funcionalidade é invisível: ninguém digita {{first_name}} por
// adivinhação. Os nomes vêm do servidor — a mesma lista que valida no salvar —,
// então a tela nunca oferece uma variável que o backend recusa.

// Uma requisição por sessão, compartilhada entre todos os campos: o catálogo é
// constante, e cada bloco de mensagem montaria a sua sem isso.
let cache = null;

function useVariaveis() {
  const [variaveis, setVariaveis] = useState(cache ?? []);

  useEffect(() => {
    if (cache) return;
    let vivo = true;
    flowsApi.variaveis()
      .then((r) => {
        cache = r.variaveis ?? [];
        if (vivo) setVariaveis(cache);
      })
      // Falhar aqui não pode derrubar o editor: sem o menu ainda dá pra
      // digitar a variável na mão.
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  return variaveis;
}

// Insere o token na posição do cursor de um input/textarea e devolve o novo
// valor. Anexar no fim seria mais simples e errado — quem escreveu
// "Olá , tudo bem?" e clicou em "Primeiro nome" quer a variável na vírgula.
export function inserirNoCampo(el, valorAtual, token, limite) {
  const texto = valorAtual ?? '';
  const inicio = el?.selectionStart ?? texto.length;
  const fim = el?.selectionEnd ?? texto.length;
  const novo = (texto.slice(0, inicio) + token + texto.slice(fim)).slice(0, limite ?? Infinity);

  if (el) {
    const caret = Math.min(inicio + token.length, novo.length);
    // Depois do re-render do React, senão o cursor volta pro fim do texto.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }
  return novo;
}

export default function InserirVariavel({ onInserir }) {
  const variaveis = useVariaveis();
  if (!variaveis.length) return null;

  return (
    <div className="vars">
      <span className="vars-rotulo">Inserir:</span>
      {variaveis.map((v) => (
        <button
          key={v.chave}
          type="button"
          className="vars-chip"
          title={`{{${v.chave}}} — ex.: ${v.exemplo}`}
          // Sem isto o clique tira o foco do campo e quem inseriu a variável
          // precisa clicar de volta no texto pra continuar escrevendo.
          // preventDefault no mousedown impede só a mudança de foco; o onClick
          // dispara normalmente. (A posição do cursor sobrevive ao blur por
          // conta própria — isto é conforto, não correção.)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInserir(`{{${v.chave}}}`)}
        >
          {v.rotulo}
        </button>
      ))}
      <span className="vars-dica" title="Use {{first_name|amigo}} para quando o lead não tiver nome">
        {'{{first_name|amigo}}'} = reserva se faltar o dado
      </span>

      <style>{`
        .vars { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; }
        .vars-rotulo { font-size: 11px; color: var(--muted-2); }
        .vars-chip {
          font-size: 11px; padding: 2px 7px; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--border); background: var(--surface-2, transparent);
          color: var(--muted);
        }
        .vars-chip:hover { border-color: var(--ink); color: var(--ink); }
        .vars-dica {
          font-size: 11px; color: var(--muted-2); margin-left: auto;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
        }
      `}</style>
    </div>
  );
}
