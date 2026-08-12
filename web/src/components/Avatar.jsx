import { useState } from 'react';

// Avatar com fallback pra iniciais.
//
// As fotos do Facebook vêm de CDN com URL assinada que expira: quando quebra,
// o alt de uma <img> quebrada aparece como texto solto e desalinha a linha
// inteira da tabela. Por isso o erro troca pro círculo de iniciais.
export default function Avatar({ nome, url, size = 28 }) {
  const [quebrou, setQuebrou] = useState(false);
  const iniciais = (nome || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const estilo = { width: size, height: size, fontSize: Math.round(size * 0.38) };

  if (!url || quebrou) {
    return (
      <span className="avatar avatar-fallback" style={estilo} aria-hidden="true">
        {iniciais}
        <style>{css}</style>
      </span>
    );
  }

  return (
    <img
      className="avatar"
      style={estilo}
      src={url}
      alt=""
      loading="lazy"
      onError={() => setQuebrou(true)}
    />
  );
}

const css = `
  .avatar {
    flex: none;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-2);
  }
  .avatar-fallback {
    display: inline-grid;
    place-items: center;
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
`;
