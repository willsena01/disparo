// Gráfico de área simples, sem dependência externa.
// data: [{ label, value }]
export default function LineAreaChart({ data, height = 220 }) {
  const width = 560;
  const padX = 34;
  const padY = 20;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (width - padX * 2) / (data.length - 1);

  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = height - padY - (d.value / max) * (height - padY * 2);
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath =
    linePath +
    ` L${points[points.length - 1][0]},${height - padY} L${points[0][0]},${height - padY} Z`;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = padY + ((height - padY * 2) / ticks) * i;
    const value = Math.round(max - (max / ticks) * i);
    return { y, value };
  });

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Leads recebidos ao longo do tempo, em uma curva ascendente até o pico e queda em seguida"
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={width - padX}
            y1={g.y}
            y2={g.y}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={4} y={g.y + 4} fontSize="11" fill="var(--muted-2)">
            {g.value}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#areaFill)" stroke="none" />
      <path d={linePath} fill="none" stroke="var(--chart-line)" strokeWidth="2" />

      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--chart-line)" />

      {data.map((d, i) => (
        <text
          key={d.label}
          x={points[i][0]}
          y={height - 2}
          fontSize="11"
          textAnchor="middle"
          fill="var(--muted-2)"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}
