// Gráfico de barras agrupadas com legenda — 3 séries por dia.
// data: [{ label, total, failed, started }]
const SERIES = [
  { key: 'total', name: 'Enviadas', color: 'var(--chart-bar)' },
  { key: 'failed', name: 'Caíram em spam/bloqueio', color: 'var(--danger)' },
  { key: 'started', name: 'Iniciaram fluxo', color: 'var(--chart-line)' },
];

export default function GroupedBarChart({ data, height = 220 }) {
  const width = 560;
  const padX = 40;
  const padY = 20;
  const max = Math.max(...data.flatMap((d) => SERIES.map((s) => d[s.key])), 1);

  const groupGap = 22;
  const groupWidth = (width - padX - groupGap * (data.length - 1)) / data.length;
  const barGap = 3;
  const barWidth = (groupWidth - barGap * (SERIES.length - 1)) / SERIES.length;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = padY + ((height - padY * 2) / ticks) * i;
    const value = Math.round(max - (max / ticks) * i);
    return { y, value };
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Mensagens enviadas, mensagens que caíram em spam ou bloqueio, e execuções de fluxo iniciadas, por dia, em barras agrupadas comparáveis"
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padX} x2={width} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth="1" />
            <text x={4} y={g.y + 4} fontSize="11" fill="var(--muted-2)">
              {formatShort(g.value)}
            </text>
          </g>
        ))}

        {data.map((d, gi) => {
          const groupX = padX + gi * (groupWidth + groupGap);
          return (
            <g key={d.label}>
              {SERIES.map((s, si) => {
                const value = d[s.key];
                const barHeight = (value / max) * (height - padY * 2);
                const x = groupX + si * (barWidth + barGap);
                const y = height - padY - barHeight;
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="2.5"
                    fill={s.color}
                  />
                );
              })}
              <text
                x={groupX + groupWidth / 2}
                y={height - 2}
                fontSize="11"
                textAnchor="middle"
                fill="var(--muted-2)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="chart-legend">
        {SERIES.map((s) => (
          <span className="legend-item" key={s.key}>
            <span className="legend-dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>

      <style>{`
        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 10px;
        }
        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function formatShort(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
