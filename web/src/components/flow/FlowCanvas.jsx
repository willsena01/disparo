import { useRef, useState } from 'react';
import { TIPOS, ROTULO_DA_SAIDA, destinoDaSaida } from './nodeTypes.js';

const LARGURA_BLOCO = 190;
const ALTURA_BLOCO = 74;

// Canvas do editor: blocos posicionados por position_x/position_y e as
// ligações desenhadas em SVG por baixo deles.
export default function FlowCanvas({
  nodes, firstNodeId, selecionado, ligando,
  onSelecionar, onMover, onSoltarNovo, onIniciarLigacao, onConcluirLigacao,
  onAbrirConfig, passoAceso,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const areaRef = useRef(null);
  const arrasto = useRef(null);

  const porId = new Map(nodes.map((n) => [n.id, n]));

  // Converte coordenada da tela em coordenada do canvas (desfaz zoom e pan).
  function paraCanvas(clientX, clientY) {
    const r = areaRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - pan.x) / zoom,
      y: (clientY - r.top - pan.y) / zoom,
    };
  }

  function ajustarNaTela() {
    if (!nodes.length) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const r = areaRef.current.getBoundingClientRect();
    const xs = nodes.map((n) => n.position_x ?? 0);
    const ys = nodes.map((n) => n.position_y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + LARGURA_BLOCO;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + ALTURA_BLOCO;
    const margem = 40;
    // Nunca amplia além de 1: um fluxo de dois blocos ficaria gigante e
    // ilegível se o "ajustar" pudesse dar zoom in.
    const z = Math.min(1, (r.width - margem * 2) / (maxX - minX), (r.height - margem * 2) / (maxY - minY));
    setZoom(z);
    setPan({
      x: margem - minX * z + (r.width - margem * 2 - (maxX - minX) * z) / 2,
      y: margem - minY * z,
    });
  }

  function aoSoltar(e) {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('tipo-de-bloco');
    if (!tipo) return;
    const p = paraCanvas(e.clientX, e.clientY);
    onSoltarNovo(tipo, Math.round(p.x - LARGURA_BLOCO / 2), Math.round(p.y - ALTURA_BLOCO / 2));
  }

  function iniciarArrasto(e, node) {
    if (e.button !== 0) return;
    const p = paraCanvas(e.clientX, e.clientY);
    arrasto.current = { id: node.id, dx: p.x - (node.position_x ?? 0), dy: p.y - (node.position_y ?? 0), moveu: false };
    onSelecionar(node.id);
  }

  function aoMover(e) {
    if (!arrasto.current) return;
    const p = paraCanvas(e.clientX, e.clientY);
    arrasto.current.moveu = true;
    onMover(arrasto.current.id, Math.round(p.x - arrasto.current.dx), Math.round(p.y - arrasto.current.dy));
  }

  return (
    <div className="canvas-wrap">
      <div className="canvas-barra">
        <span className="canvas-dica">
          {ligando
            ? 'Clique no bloco de destino para ligar — ou Esc para cancelar'
            : `${nodes.length} bloco(s)`}
        </span>
        <div className="canvas-zoom">
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} aria-label="Diminuir zoom">−</button>
          <span className="tabular zoom-num">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Aumentar zoom">+</button>
          <button className="btn btn-sm" onClick={ajustarNaTela}>Ajustar</button>
        </div>
      </div>

      <div
        className={`canvas${ligando ? ' ligando' : ''}`}
        ref={areaRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={aoSoltar}
        onMouseMove={aoMover}
        onMouseUp={() => { arrasto.current = null; }}
        onMouseLeave={() => { arrasto.current = null; }}
      >
        {!nodes.length && (
          <p className="canvas-vazio">Arraste <strong>Mensagem</strong> da esquerda para começar</p>
        )}

        <div className="canvas-mundo" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="canvas-linhas" aria-hidden="true">
            {nodes.flatMap((n) =>
              TIPOS[n.type].saidas.map((saida) => {
                const alvo = porId.get(destinoDaSaida(n, saida));
                if (!alvo) return null;
                return (
                  <Ligacao key={`${n.id}-${saida}`} de={n} para={alvo} rotulo={ROTULO_DA_SAIDA[saida]} />
                );
              })
            )}
          </svg>

          {nodes.map((n) => (
            <Bloco
              key={n.id}
              node={n}
              inicial={n.id === firstNodeId}
              selecionado={n.id === selecionado}
              aceso={passoAceso === n.id}
              ligandoDe={ligando}
              onMouseDown={(e) => iniciarArrasto(e, n)}
              onClick={() => {
                // Um arrasto termina em clique; sem isso, mover um bloco
                // abriria a configuração dele toda vez.
                if (arrasto.current?.moveu) return;
                if (ligando) onConcluirLigacao(n.id);
                else onAbrirConfig(n.id);
              }}
              onAbrirConfig={() => onAbrirConfig(n.id)}
              onIniciarLigacao={(saida) => onIniciarLigacao(n.id, saida)}
            />
          ))}
        </div>
      </div>

      <style>{estilo}</style>
    </div>
  );
}

function Ligacao({ de, para, rotulo }) {
  const x1 = (de.position_x ?? 0) + LARGURA_BLOCO / 2;
  const y1 = (de.position_y ?? 0) + ALTURA_BLOCO;
  const x2 = (para.position_x ?? 0) + LARGURA_BLOCO / 2;
  const y2 = para.position_y ?? 0;
  const meio = (y1 + y2) / 2;

  return (
    <g>
      <path
        d={`M ${x1} ${y1} C ${x1} ${meio}, ${x2} ${meio}, ${x2} ${y2}`}
        fill="none" stroke="var(--border)" strokeWidth="2"
      />
      <circle cx={x2} cy={y2} r="3" fill="var(--border)" />
      {rotulo && (
        <text x={(x1 + x2) / 2} y={meio} className="linha-rotulo" textAnchor="middle">{rotulo}</text>
      )}
    </g>
  );
}

function Bloco({ node, inicial, selecionado, aceso, ligandoDe, onMouseDown, onClick, onAbrirConfig, onIniciarLigacao }) {
  const t = TIPOS[node.type];

  return (
    <div
      className={`bloco${selecionado ? ' sel' : ''}${aceso ? ' aceso' : ''}`}
      style={{ left: node.position_x ?? 0, top: node.position_y ?? 0, borderLeftColor: t.cor }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div className="bloco-topo">
        <span className="bloco-tipo" style={{ color: t.cor }}>{t.rotulo}</span>
        {inicial && <span className="bloco-inicio">início</span>}
        <button
          className="bloco-config"
          onClick={(e) => { e.stopPropagation(); onAbrirConfig(); }}
          aria-label={`Configurar bloco ${t.rotulo}`}
        >
          ⚙
        </button>
      </div>
      <p className="bloco-resumo">{t.resumo(node.config ?? {})}</p>

      <div className="bloco-saidas">
        {t.saidas.map((s) => (
          <button
            key={s}
            className={`saida${ligandoDe?.nodeId === node.id && ligandoDe?.saida === s ? ' saida-ativa' : ''}`}
            onClick={(e) => { e.stopPropagation(); onIniciarLigacao(s); }}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Ligar saída ${ROTULO_DA_SAIDA[s] || 'seguinte'} a outro bloco`}
          >
            {ROTULO_DA_SAIDA[s] || '↓'}
          </button>
        ))}
      </div>
    </div>
  );
}

const estilo = `
  .canvas-wrap { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .canvas-barra {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border);
  }
  .canvas-dica { font-size: 12px; color: var(--muted); }
  .canvas-zoom { display: flex; align-items: center; gap: 6px; }
  .zoom-num { font-size: 12px; color: var(--muted); min-width: 38px; text-align: center; }
  .canvas {
    position: relative; flex: 1; min-height: 420px; overflow: hidden;
    background:
      radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 18px 18px;
  }
  .canvas.ligando { cursor: crosshair; }
  .canvas-vazio {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: var(--muted); font-size: 13.5px; pointer-events: none; text-align: center; padding: 20px;
  }
  .canvas-mundo { position: absolute; inset: 0; transform-origin: 0 0; }
  .canvas-linhas { position: absolute; overflow: visible; width: 1px; height: 1px; }
  .linha-rotulo { font-size: 10px; fill: var(--muted); }
  .bloco {
    position: absolute; width: ${LARGURA_BLOCO}px; min-height: ${ALTURA_BLOCO}px;
    background: var(--surface); border: 1px solid var(--border); border-left-width: 3px;
    border-radius: 9px; padding: 8px 10px; cursor: grab; user-select: none;
    box-shadow: var(--shadow-card);
  }
  .bloco.sel { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .bloco.aceso { border-color: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
  .bloco-topo { display: flex; align-items: center; gap: 6px; }
  .bloco-tipo { font-size: 11.5px; font-weight: 600; flex: 1; }
  .bloco-inicio {
    font-size: 10px; padding: 1px 6px; border-radius: 999px;
    background: var(--accent-soft); color: var(--accent-ink);
  }
  .bloco-config {
    border: none; background: transparent; color: var(--muted-2);
    font-size: 12px; padding: 0 2px; line-height: 1;
  }
  .bloco-resumo {
    font-size: 12px; color: var(--muted); margin-top: 4px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .bloco-saidas {
    position: absolute; bottom: -10px; left: 0; right: 0;
    display: flex; justify-content: center; gap: 6px;
  }
  .saida {
    min-width: 20px; height: 20px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--muted); font-size: 10px; line-height: 1; padding: 0 5px;
  }
  .saida:hover, .saida-ativa { border-color: var(--accent); color: var(--accent); }
`;
