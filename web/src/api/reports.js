async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status} em ${path}`);
  }
  return res.json();
}

// O painel vem numa chamada só — a tela troca o período e recarrega tudo junto.
export const fetchReports = (dias) => getJSON(`/api/reports?dias=${dias}`);

// O mapa de calor busca sozinho porque tem um controle próprio (visualizações
// vs cliques). Recarregar o painel inteiro pra trocar de métrica faria a tela
// toda piscar em esqueleto por causa de um botão.
export const fetchHeatmap = (dias, metrica) =>
  getJSON(`/api/reports/mapa-de-calor?dias=${dias}&metrica=${metrica}`);
