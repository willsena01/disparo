// Tabela simples e reutilizável dos Relatórios.
// colunas: [{ chave, titulo, alinha?, render? }]
export default function DataTable({ titulo, colunas, linhas, vazio, chaveDaLinha }) {
  return (
    <div className="card tabela-card">
      <h2 className="section-title">{titulo}</h2>

      {!linhas?.length ? (
        <p className="tabela-vazio">{vazio}</p>
      ) : (
        // O wrapper com overflow é o que impede a página inteira de rolar na
        // horizontal quando a tabela não cabe no celular.
        <div className="tabela-scroll">
          <table className="tabela">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c.chave} scope="col" className={c.alinha === 'direita' ? 'dir' : ''}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={chaveDaLinha ? chaveDaLinha(linha) : i}>
                  {colunas.map((c) => (
                    <td
                      key={c.chave}
                      className={`${c.alinha === 'direita' ? 'dir tabular' : ''}`}
                    >
                      {c.render ? c.render(linha) : linha[c.chave]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tabela-card { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .section-title { font-size: 14px; font-weight: 600; }
        .tabela-vazio { font-size: 13px; color: var(--muted); line-height: 1.5; }
        .tabela-scroll { overflow-x: auto; }
        .tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tabela th {
          text-align: left; font-weight: 500; font-size: 12px; color: var(--muted);
          padding: 0 12px 8px 0; white-space: nowrap;
          border-bottom: 1px solid var(--border);
        }
        .tabela td {
          padding: 10px 12px 10px 0;
          border-bottom: 1px solid var(--border);
        }
        .tabela tr:last-child td { border-bottom: none; }
        .tabela th.dir, .tabela td.dir { text-align: right; padding-right: 0; }
      `}</style>
    </div>
  );
}
