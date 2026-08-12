import { useEffect, useRef } from 'react';

// Diálogo dos formulários (nova campanha, novo template, novo grupo).
//
// Usa <dialog> nativo em vez de div com overlay: o navegador já entrega
// fechar no Esc, foco preso dentro do diálogo e o resto da página inerte pra
// leitor de tela. Reimplementar isso à mão é onde acessibilidade se perde.
export default function Modal({ aberto, titulo, onFechar, children, largura = 480 }) {
  const ref = useRef(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (aberto && !dlg.open) dlg.showModal();
    if (!aberto && dlg.open) dlg.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className="modal"
      style={{ maxWidth: largura }}
      // O Esc dispara 'cancel'/'close' nativos — sem avisar o React, o estado
      // ficaria "aberto" com o diálogo fechado, e o botão não reabriria.
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      onClose={onFechar}
    >
      <form method="dialog" className="modal-head">
        <h2 className="section-title">{titulo}</h2>
        <button className="btn btn-icon" type="submit" aria-label="Fechar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </form>
      <div className="modal-body">{children}</div>

      <style>{`
        .modal {
          width: calc(100vw - 32px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          color: var(--ink);
          padding: 0;
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
        }
        .modal::backdrop { background: rgba(10, 12, 16, 0.45); }
        .modal-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 16px 18px; border-bottom: 1px solid var(--border);
        }
        .modal-body {
          padding: 18px;
          display: flex; flex-direction: column; gap: 14px;
          max-height: min(70vh, 560px);
          overflow-y: auto;
        }
      `}</style>
    </dialog>
  );
}
