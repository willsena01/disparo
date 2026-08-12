import { useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { fetchHeatmap } from '../api/reports.js';
import { CardSkeleton, CardError } from './CardState.jsx';
import InfoDot from '../icons/InfoDot.jsx';

// EXTRACT(DOW) do Postgres devolve 0 = domingo.
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Mapa de calor dia da semana x hora.
//
// Busca o próprio dado porque tem controle próprio (visualizações vs cliques):
// recarregar o painel inteiro pra trocar de métrica faria a tela toda piscar.
export default function Heatmap({ dias }) {
  const [metrica, setMetrica] = useState('visualizacoes');
  const mapa = useAsync(() => fetchHeatmap(dias, metrica), [dias, metrica]);

  return (
    <div className="card heat">
      <div className="heat-head">
        <h2 className="section-title">
          Melhor dia e hora
          <InfoDot text="Usa a hora em que a pessoa leu ou clicou — não a hora em que você disparou. A pergunta é quando ela está disponível." />
        </h2>
        <div className="heat-toggle" role="radiogroup" aria-label="Métrica do mapa de calor">
          {[
            ['visualizacoes', 'Visualizações'],
            ['cliques', 'Cliques'],
          ].map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={metrica === valor}
              className={metrica === valor ? 'ativo' : ''}
              onClick={() => setMetrica(valor)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mapa.loading && <CardSkeleton lines={5} />}
      {mapa.error && <CardError message={mapa.error.message} />}
      {mapa.data && <Grade mapa={mapa.data} metrica={metrica} />}

      <style>{`
        .heat { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
        .section-title { font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
        .heat-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
        }
        .heat-toggle { display: inline-flex; gap: 2px; padding: 3px; background: var(--surface-2); border-radius: 8px; }
        .heat-toggle button {
          border: none; background: transparent; color: var(--muted);
          font-size: 12.5px; padding: 5px 11px; border-radius: 6px; cursor: pointer;
        }
        .heat-toggle button.ativo { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); }
      `}</style>
    </div>
  );
}

function Grade({ mapa, metrica }) {
  const max = Math.max(...mapa.grade.map((c) => c.valor), 0);
  const nomeMetrica = metrica === 'cliques' ? 'cliques' : 'visualizações';

  if (!max) {
    return (
      <p className="heat-vazio">
        Ainda não há {nomeMetrica} registradas neste período — o mapa se preenche conforme os
        dados chegam.
        <style>{`.heat-vazio { font-size: 13px; color: var(--muted); line-height: 1.5; }`}</style>
      </p>
    );
  }

  // A grade é uma tabela de verdade (não divs): é uma matriz de valores com
  // cabeçalho de linha e de coluna, e é assim que leitor de tela navega nela.
  return (
    <div className="heat-wrap">
      {mapa.melhor && (
        <p className="heat-melhor">
          Melhor janela: <strong>{DIAS[mapa.melhor.dia]} às {String(mapa.melhor.hora).padStart(2, '0')}h</strong>
          {' '}({mapa.melhor.valor} {nomeMetrica})
        </p>
      )}

      <div className="heat-scroll">
        <table className="heat-tabela">
          <caption className="sr-only">
            {nomeMetrica} por dia da semana e hora do dia
          </caption>
          <thead>
            <tr>
              <th scope="col" className="canto"><span className="sr-only">Dia</span></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th scope="col" key={h} className="hora">
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                  <span className="sr-only">{h}h</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((nome, dia) => (
              <tr key={dia}>
                <th scope="row" className="dia">{nome}</th>
                {Array.from({ length: 24 }, (_, hora) => {
                  const celula = mapa.grade.find((c) => c.dia === dia && c.hora === hora);
                  const valor = celula?.valor ?? 0;
                  return (
                    <td key={hora}>
                      <span
                        className="celula"
                        style={{
                          // Piso de 0.12 quando há valor: uma célula com 1
                          // registro ficaria indistinguível de zero.
                          background: valor
                            ? `color-mix(in srgb, var(--accent) ${12 + (valor / max) * 88}%, transparent)`
                            : 'var(--surface-2)',
                        }}
                        title={`${nome}, ${String(hora).padStart(2, '0')}h — ${valor} ${nomeMetrica}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="heat-legenda">
        <span>menos</span>
        <span className="escala" aria-hidden="true" />
        <span>mais</span>
      </div>

      <style>{`
        .heat-wrap { display: flex; flex-direction: column; gap: 12px; }
        .heat-melhor { font-size: 13px; color: var(--muted); }
        .heat-melhor strong { color: var(--ink); }
        .heat-scroll { overflow-x: auto; }
        .heat-tabela { border-collapse: separate; border-spacing: 2px; }
        .heat-tabela .canto { width: 34px; }
        .heat-tabela .hora {
          font-size: 10px; font-weight: 500; color: var(--muted-2);
          text-align: center; padding-bottom: 2px; min-width: 14px;
        }
        .heat-tabela .dia {
          font-size: 11px; font-weight: 500; color: var(--muted);
          text-align: right; padding-right: 6px; white-space: nowrap;
        }
        .celula { display: block; width: 14px; height: 14px; border-radius: 3px; }
        .heat-legenda {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: var(--muted-2);
        }
        .escala {
          width: 90px; height: 8px; border-radius: 999px;
          background: linear-gradient(90deg,
            color-mix(in srgb, var(--accent) 12%, transparent),
            var(--accent));
        }
        .sr-only {
          position: absolute; width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </div>
  );
}
