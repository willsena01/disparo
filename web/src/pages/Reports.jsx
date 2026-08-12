import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatCard from '../components/StatCard.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import Funnel from '../components/Funnel.jsx';
import Heatmap from '../components/Heatmap.jsx';
import DataTable from '../components/DataTable.jsx';
import { CardSkeleton, CardError } from '../components/CardState.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { fetchReports } from '../api/reports.js';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');

export default function Reports() {
  const [dias, setDias] = useState(7);
  const rel = useAsync(() => fetchReports(dias), [dias]);

  return (
    <Layout title="Relatórios">
      <div className="rel-topo">
        <div>
          <h1 className="rel-titulo">Relatórios</h1>
          <p className="rel-sub">Desempenho dos disparos e da captação de leads.</p>
        </div>
        <PeriodFilter dias={dias} onChange={setDias} disabled={rel.loading} />
      </div>

      {rel.error && (
        <div className="card">
          <CardError message={rel.error.message} />
        </div>
      )}

      {rel.loading && (
        <div className="card">
          <CardSkeleton lines={6} />
        </div>
      )}

      {rel.data && <Conteudo dados={rel.data} dias={dias} />}

      <style>{`
        .rel-topo {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; flex-wrap: wrap;
        }
        .rel-titulo { font-size: 19px; font-weight: 700; }
        .rel-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }
      `}</style>
    </Layout>
  );
}

function Conteudo({ dados, dias }) {
  const { atual, anterior, variacao, taxas, baseDeLeads } = dados;

  return (
    <>
      <Recomendacoes cards={dados.recomendacoes} />

      <div className="rel-grid-metricas">
        <StatCard label="Enviadas" value={nf(atual.enviadas)} hint={`${atual.falhas} falharam`} />
        <StatCard
          label="Entregues"
          value={nf(atual.entregues)}
          hint={`${taxas.entrega}% das enviadas`}
        />
        <StatCard
          label="Visualizações"
          value={nf(atual.visualizacoes)}
          hint={`${taxas.leitura}% das enviadas`}
          tooltip={dados.avisos.visualizacoes}
        />
        <StatCard
          label="Cliques"
          value={nf(atual.cliques)}
          hint={`${atual.leadsQueClicaram} lead(s) distintos`}
          tooltip={dados.avisos.cliques}
        />
        <StatCard label="Base de leads" value={nf(baseDeLeads)} hint={`${atual.novosLeads} novos no período`} />
      </div>

      <Comparativo atual={atual} anterior={anterior} variacao={variacao} dias={dias} />

      <div className="rel-grid-2">
        <Funnel
          titulo="Funil da base"
          etapas={dados.funilDaBase}
          vazio="Nenhum lead na base ainda."
        />
        <Funnel
          titulo="Funil da campanha"
          etapas={dados.funilDaCampanha}
          vazio="Nenhuma campanha disparada neste período."
        />
      </div>

      <Heatmap dias={dias} />

      <div className="rel-grid-2">
        <DataTable
          titulo="Comentários por página"
          colunas={[
            { chave: 'pageName', titulo: 'Página' },
            { chave: 'comentarios', titulo: 'Comentários', alinha: 'direita' },
            { chave: 'viraramLead', titulo: 'Viraram lead', alinha: 'direita' },
            {
              chave: 'taxaConversao',
              titulo: 'Taxa',
              alinha: 'direita',
              render: (l) => `${l.taxaConversao}%`,
            },
          ]}
          linhas={dados.comentariosPorPagina}
          chaveDaLinha={(l) => l.pageId}
          vazio="Nenhum comentário capturado neste período."
        />
        <DataTable
          titulo="Desempenho por página"
          colunas={[
            { chave: 'pageName', titulo: 'Página' },
            { chave: 'enviadas', titulo: 'Enviadas', alinha: 'direita' },
            {
              chave: 'taxaAbertura',
              titulo: 'Abertura',
              alinha: 'direita',
              render: (l) => `${l.taxaAbertura}%`,
            },
          ]}
          linhas={dados.desempenhoPorPagina}
          chaveDaLinha={(l) => l.pageId}
          vazio="Nenhuma mensagem enviada neste período."
        />
      </div>

      <div className="rel-grid-2">
        <DataTable
          titulo="Posts que mais puxam comentário"
          colunas={[
            {
              chave: 'postId',
              titulo: 'Post',
              // O post_id do Facebook é "pageid_postid" e não cabe na coluna;
              // o sufixo é a parte que identifica o post pra quem opera.
              render: (l) => (
                <span title={l.postId}>
                  {l.pageName} · <span className="tabular">{String(l.postId).split('_').pop()}</span>
                </span>
              ),
            },
            { chave: 'comentarios', titulo: 'Comentários', alinha: 'direita' },
            { chave: 'leads', titulo: 'Leads', alinha: 'direita' },
          ]}
          linhas={dados.postsComMaisComentarios}
          chaveDaLinha={(l) => l.postId}
          vazio="Nenhum post com comentário capturado neste período."
        />
        <DataTable
          titulo="Fontes de leads"
          colunas={[
            { chave: 'source', titulo: 'Origem', render: (l) => rotuloFonte(l.source) },
            { chave: 'total', titulo: 'Leads', alinha: 'direita' },
            { chave: 'percentual', titulo: 'Share', alinha: 'direita', render: (l) => `${l.percentual}%` },
          ]}
          linhas={dados.fontesDeLeads}
          chaveDaLinha={(l) => l.source}
          vazio="Nenhum lead novo neste período."
        />
      </div>

      {/* O aviso não é decoração: zero em cliques ou visualizações costuma ser
          falta de instrumentação, não falta de comportamento — e ler como se
          fosse comportamento leva a conclusão errada sobre a campanha. */}
      <p className="rel-aviso">
        <strong>Sobre estes números.</strong> <em>Cliques</em> só são contados em botões com link,
        que a ferramenta reescreve para medir — link solto no texto da mensagem não é rastreado.{' '}
        <em>Visualizações</em> dependem do recibo de leitura do Facebook, que nem sempre chega. Zero
        em qualquer um dos dois pode significar que a medição não está no ar, e não que ninguém
        abriu ou clicou.
      </p>

      <style>{`
        .rel-grid-metricas {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 14px;
        }
        .rel-grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
          gap: 14px;
        }
        .rel-aviso {
          font-size: 12px; color: var(--muted-2); line-height: 1.6;
          padding: 2px 2px 8px;
        }
        .rel-aviso strong { color: var(--muted); }
        .rel-aviso em { font-style: normal; color: var(--muted); }
      `}</style>
    </>
  );
}

function Recomendacoes({ cards }) {
  if (!cards?.length) return null;
  return (
    <div className="rec-grid">
      {cards.map((c, i) => (
        <div className={`card rec rec-${c.tipo}`} key={i}>
          <p className="rec-titulo">{c.titulo}</p>
          <p className="rec-texto">{c.texto}</p>
        </div>
      ))}
      <style>{`
        .rec-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 14px;
        }
        .rec { padding: 14px 16px; display: flex; flex-direction: column; gap: 5px; border-left: 3px solid var(--border); }
        .rec-titulo { font-size: 13px; font-weight: 600; }
        .rec-texto { font-size: 12.5px; color: var(--muted); line-height: 1.5; }
        .rec-bom { border-left-color: var(--success); }
        .rec-alerta { border-left-color: var(--warning); }
        .rec-info { border-left-color: var(--accent); }
      `}</style>
    </div>
  );
}

function Comparativo({ atual, anterior, variacao, dias }) {
  const linhas = [
    ['Novos leads', atual.novosLeads, anterior.novosLeads, variacao.novosLeads],
    ['Envios', atual.enviadas, anterior.enviadas, variacao.enviadas],
    ['Cliques', atual.cliques, anterior.cliques, variacao.cliques],
  ];

  return (
    <div className="card comp">
      <h2 className="section-title">
        Comparado aos {dias} dia{dias > 1 ? 's' : ''} anteriores
      </h2>
      <div className="comp-linhas">
        {linhas.map(([rotulo, agora, antes, delta]) => (
          <div className="comp-item" key={rotulo}>
            <span className="comp-rotulo">{rotulo}</span>
            <span className="comp-valor tabular">{nf(agora)}</span>
            <span className={`comp-delta ${delta > 0 ? 'sobe' : delta < 0 ? 'desce' : 'igual'}`}>
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} {Math.abs(delta)}%
            </span>
            <span className="comp-antes tabular">antes: {nf(antes)}</span>
          </div>
        ))}
      </div>
      <style>{`
        .comp { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
        .section-title { font-size: 14px; font-weight: 600; }
        .comp-linhas {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px;
        }
        .comp-item {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: baseline;
          gap: 2px 10px;
        }
        .comp-rotulo { font-size: 12.5px; color: var(--muted); grid-column: 1 / -1; }
        .comp-valor { font-size: 22px; font-weight: 700; }
        .comp-delta { font-size: 12.5px; font-weight: 600; }
        .comp-delta.sobe { color: var(--success); }
        .comp-delta.desce { color: var(--danger); }
        .comp-delta.igual { color: var(--muted-2); }
        .comp-antes { font-size: 11.5px; color: var(--muted-2); grid-column: 1 / -1; }
      `}</style>
    </div>
  );
}

function rotuloFonte(source) {
  return (
    {
      comment: 'Comentário',
      import: 'Importação',
      broadcast: 'Campanha',
      manual: 'Manual',
    }[source] ?? source
  );
}
