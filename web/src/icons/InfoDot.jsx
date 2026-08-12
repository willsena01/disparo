// Ícone "i" com tooltip acessível (hover ou foco por teclado).
export default function InfoDot({ text }) {
  return (
    <span className="info-dot" tabIndex={0}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5.5" strokeLinecap="round" />
        <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      <span className="info-bubble" role="tooltip">
        {text}
      </span>

      <style>{`
        .info-dot {
          position: relative;
          display: inline-flex;
          color: var(--muted-2);
          cursor: help;
        }
        .info-bubble {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          width: 220px;
          background: var(--ink);
          color: var(--bg);
          font-size: 12px;
          line-height: 1.4;
          padding: 8px 10px;
          border-radius: 7px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease, transform 0.12s ease;
          z-index: 10;
        }
        .info-dot:hover .info-bubble,
        .info-dot:focus-visible .info-bubble {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .info-bubble { transition: none; }
        }
      `}</style>
    </span>
  );
}
