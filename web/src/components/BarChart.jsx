// Gráfico de barras simples, sem dependência externa.
// data: [{ label, value }]
export default function BarChart({ data, height = 220 }) {
  const width = 560;
  const padX = 40;
  const padY = 20;
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 18;
  const barWidth = (width - padX - gap * (data.length - 1)) / data.length - 4;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = padY + ((height - padY * 2) / ticks) * i;
    const value = Math.round(max - (max / ticks) * i);
    return { y, value };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Mensagens enviadas por dia, em barras comparáveis entre os últimos dias"
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
    >
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={width}
            y1={g.y}
            y2={g.y}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={4} y={g.y + 4} fontSize="11" fill="var(--muted-2)">
            {formatShort(g.value)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const x = padX + i * (barWidth + gap + 4);
        const barHeight = (d.value / max) * (height - padY * 2);
        const y = height - padY - barHeight;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill="var(--chart-bar)"
            />
            <text
              x={x + barWidth / 2}
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
  );
}

function formatShort(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
