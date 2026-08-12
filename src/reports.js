import { pool } from './db/pool.js';

// Agregações do painel de Relatórios.
//
// Nenhum número é calculado em JS a partir de estimativa: tudo sai de contagem
// no banco. O que ainda não tem origem de dado vem zero — e o endpoint diz
// explicitamente o porquê, pra ninguém ler zero como "ninguém abriu".

export const PERIODOS = [1, 7, 15, 30];

function normalizarDias(dias) {
  const n = Number(dias);
  return PERIODOS.includes(n) ? n : 30;
}

// Condição "esta coluna está na janela dos últimos N dias", em SQL.
//
// A janela é calculada com o relógio do BANCO, nunca com `new Date()` do Node.
// Misturar os dois é uma corrida real: as linhas são gravadas com now() do
// Postgres, e se esse relógio estiver adiante por milissegundos, um registro
// criado agora cai fora de uma janela que termina "agora" e some do relatório.
//
// `de` e `ate` são deslocamentos em dias para trás. ate = 0 significa agora.
function janelaSql(coluna, de, ate = 0) {
  // Os valores são interpolados na query, então precisam ser números de fato —
  // `de`/`ate` vêm de normalizarDias, mas a coerção aqui fecha a porta pra
  // qualquer chamador futuro passar texto.
  const d = Number(de) || 0;
  const a = Number(ate) || 0;
  return `${coluna} >= now() - interval '${d} days'
          AND ${coluna} < now() - interval '${a} days'`;
}

// Período atual e o imediatamente anterior, de mesmo tamanho — é o que permite
// dizer "cresceu X% em relação aos 7 dias anteriores".
function janelas(dias) {
  return {
    atual: [dias, 0],
    anterior: [dias * 2, dias],
  };
}

async function metricasDoIntervalo(workspaceId, [de, ate]) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                        AS enviadas,
       COUNT(*) FILTER (WHERE status IN ('delivered','read'))::int AS entregues,
       COUNT(*) FILTER (WHERE status = 'read')::int         AS visualizacoes,
       COUNT(*) FILTER (WHERE status = 'failed')::int       AS falhas
     FROM messages
     WHERE workspace_id = $1 AND ${janelaSql('sent_at', de, ate)}`,
    [workspaceId]
  );

  const { rows: cliques } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT c.lead_id)::int AS leads
     FROM link_clicks c
     JOIN tracked_links t ON t.id = c.tracked_link_id
     WHERE t.workspace_id = $1 AND ${janelaSql('c.clicked_at', de, ate)}`,
    [workspaceId]
  );

  const { rows: novosLeads } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM leads
     WHERE workspace_id = $1 AND ${janelaSql('created_at', de, ate)}`,
    [workspaceId]
  );

  return {
    enviadas: rows[0].enviadas,
    entregues: rows[0].entregues,
    visualizacoes: rows[0].visualizacoes,
    falhas: rows[0].falhas,
    cliques: cliques[0].total,
    leadsQueClicaram: cliques[0].leads,
    novosLeads: novosLeads[0].total,
  };
}

function variacao(atual, anterior) {
  if (!anterior) return atual ? 100 : 0;
  return Math.round(((atual - anterior) / anterior) * 100);
}

function pct(parte, todo) {
  return todo ? Math.round((parte / todo) * 1000) / 10 : 0;
}

// 1 + 2: métricas do período e comparativo com o período anterior.
export async function resumo(workspaceId, dias) {
  const d = normalizarDias(dias);
  const j = janelas(d);

  // Sequencial: são agregações sobre as mesmas tabelas, então rodar em
  // paralelo só faz elas disputarem I/O entre si.
  const atual = await metricasDoIntervalo(workspaceId, j.atual);
  const anterior = await metricasDoIntervalo(workspaceId, j.anterior);
  const base = await pool.query(
    'SELECT COUNT(*)::int AS total FROM leads WHERE workspace_id = $1', [workspaceId]
  );

  return {
    dias: d,
    baseDeLeads: base.rows[0].total,
    atual,
    anterior,
    variacao: {
      novosLeads: variacao(atual.novosLeads, anterior.novosLeads),
      enviadas: variacao(atual.enviadas, anterior.enviadas),
      cliques: variacao(atual.cliques, anterior.cliques),
      visualizacoes: variacao(atual.visualizacoes, anterior.visualizacoes),
    },
    taxas: {
      entrega: pct(atual.entregues, atual.enviadas),
      leitura: pct(atual.visualizacoes, atual.enviadas),
      clique: pct(atual.leadsQueClicaram, atual.enviadas),
      falha: pct(atual.falhas, atual.enviadas),
    },
  };
}

// 3: funil da base — contatos -> inscritos -> entregáveis.
export async function funilDaBase(workspaceId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                                  AS contatos,
       COUNT(*) FILTER (WHERE subscribed)::int                        AS inscritos,
       COUNT(*) FILTER (WHERE subscribed AND deliverability_status <> 'blocked')::int AS entregaveis
     FROM leads WHERE workspace_id = $1`,
    [workspaceId]
  );
  const f = rows[0];
  return [
    { etapa: 'Contatos', valor: f.contatos, percentual: 100 },
    { etapa: 'Inscritos', valor: f.inscritos, percentual: pct(f.inscritos, f.contatos) },
    { etapa: 'Entregáveis', valor: f.entregaveis, percentual: pct(f.entregaveis, f.contatos) },
  ];
}

// 4: funil da campanha — enviadas -> entregues -> lidas -> clicaram.
// Sem broadcastId, agrega todas as campanhas do período.
export async function funilDaCampanha(workspaceId, { dias, broadcastId } = {}) {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const params = [workspaceId];
  let filtro = '';
  if (broadcastId) {
    params.push(broadcastId);
    filtro = ' AND broadcast_id = $2';
  }

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                               AS enviadas,
       COUNT(*) FILTER (WHERE status IN ('delivered','read'))::int AS entregues,
       COUNT(*) FILTER (WHERE status = 'read')::int                AS lidas
     FROM messages
     WHERE workspace_id = $1 AND ${janelaSql('sent_at', de, ate)}
       AND broadcast_id IS NOT NULL${filtro}`,
    params
  );

  const cliqueParams = [workspaceId];
  let cliqueFiltro = '';
  if (broadcastId) {
    cliqueParams.push(broadcastId);
    cliqueFiltro = ' AND t.broadcast_id = $2';
  }
  const { rows: cliques } = await pool.query(
    `SELECT COUNT(DISTINCT c.lead_id)::int AS clicaram
     FROM link_clicks c
     JOIN tracked_links t ON t.id = c.tracked_link_id
     WHERE t.workspace_id = $1 AND ${janelaSql('c.clicked_at', de, ate)}
       AND t.broadcast_id IS NOT NULL${cliqueFiltro}`,
    cliqueParams
  );

  const f = rows[0];
  const base = f.enviadas;
  return [
    { etapa: 'Enviadas', valor: f.enviadas, percentual: 100 },
    { etapa: 'Entregues', valor: f.entregues, percentual: pct(f.entregues, base) },
    { etapa: 'Lidas', valor: f.lidas, percentual: pct(f.lidas, base) },
    { etapa: 'Clicaram', valor: cliques[0].clicaram, percentual: pct(cliques[0].clicaram, base) },
  ];
}

// 5: comentários por página, com quantos viraram lead.
export async function comentariosPorPagina(workspaceId, dias) {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const { rows } = await pool.query(
    `SELECT c.page_id,
            COALESCE(MAX(p.name), c.page_id)                     AS page_name,
            COUNT(*)::int                                         AS comentarios,
            COUNT(*) FILTER (WHERE c.lead_id IS NOT NULL)::int    AS viraram_lead
     FROM comments c
     LEFT JOIN facebook_pages p ON p.page_id = c.page_id
     WHERE c.workspace_id = $1 AND ${janelaSql('c.created_at', de, ate)}
     GROUP BY c.page_id
     ORDER BY comentarios DESC`,
    [workspaceId]
  );

  return rows.map((r) => ({
    pageId: r.page_id,
    pageName: r.page_name,
    comentarios: r.comentarios,
    viraramLead: r.viraram_lead,
    taxaConversao: pct(r.viraram_lead, r.comentarios),
  }));
}

// 6: posts que mais puxam comentário.
export async function postsComMaisComentarios(workspaceId, dias, limite = 10) {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const { rows } = await pool.query(
    `SELECT c.post_id, c.page_id,
            COALESCE(MAX(p.name), c.page_id)                   AS page_name,
            COUNT(*)::int                                       AS comentarios,
            COUNT(*) FILTER (WHERE c.lead_id IS NOT NULL)::int  AS leads
     FROM comments c
     LEFT JOIN facebook_pages p ON p.page_id = c.page_id
     WHERE c.workspace_id = $1 AND ${janelaSql('c.created_at', de, ate)}
       AND c.post_id IS NOT NULL
     GROUP BY c.post_id, c.page_id
     ORDER BY comentarios DESC
     LIMIT $2`,
    [workspaceId, limite]
  );

  return rows.map((r) => ({
    postId: r.post_id,
    pageId: r.page_id,
    pageName: r.page_name,
    comentarios: r.comentarios,
    leads: r.leads,
  }));
}

// 7: desempenho por página — enviadas e taxa de abertura.
export async function desempenhoPorPagina(workspaceId, dias) {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const { rows } = await pool.query(
    `SELECT l.page_id,
            COALESCE(MAX(p.name), l.page_id)                    AS page_name,
            COUNT(m.id)::int                                     AS enviadas,
            COUNT(m.id) FILTER (WHERE m.status = 'read')::int    AS lidas,
            COUNT(m.id) FILTER (WHERE m.status = 'failed')::int  AS falhas
     FROM messages m
     JOIN leads l ON l.id = m.lead_id
     LEFT JOIN facebook_pages p ON p.page_id = l.page_id
     WHERE m.workspace_id = $1 AND ${janelaSql('m.sent_at', de, ate)}
     GROUP BY l.page_id
     ORDER BY enviadas DESC`,
    [workspaceId]
  );

  return rows.map((r) => ({
    pageId: r.page_id,
    pageName: r.page_name,
    enviadas: r.enviadas,
    lidas: r.lidas,
    falhas: r.falhas,
    taxaAbertura: pct(r.lidas, r.enviadas),
  }));
}

// 8: mapa de calor dia da semana x hora.
//
// `metrica` escolhe a fonte: 'visualizacoes' usa a hora da LEITURA (read_at) e
// 'cliques' a hora do clique — a pergunta é "quando a pessoa está disponível",
// não "quando eu disparei".
export async function mapaDeCalor(workspaceId, dias, metrica = 'visualizacoes') {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const sql =
    metrica === 'cliques'
      ? `SELECT EXTRACT(DOW FROM c.clicked_at)::int AS dia,
                EXTRACT(HOUR FROM c.clicked_at)::int AS hora,
                COUNT(*)::int AS valor
         FROM link_clicks c
         JOIN tracked_links t ON t.id = c.tracked_link_id
         WHERE t.workspace_id = $1 AND ${janelaSql('c.clicked_at', de, ate)}
         GROUP BY dia, hora`
      : `SELECT EXTRACT(DOW FROM read_at)::int AS dia,
                EXTRACT(HOUR FROM read_at)::int AS hora,
                COUNT(*)::int AS valor
         FROM messages
         WHERE workspace_id = $1 AND read_at IS NOT NULL
           AND ${janelaSql('read_at', de, ate)}
         GROUP BY dia, hora`;

  const { rows } = await pool.query(sql, [workspaceId]);

  // Grade completa 7x24: buraco no mapa de calor é lido como "nada aqui", e
  // sem preencher a interface teria que adivinhar a diferença entre 0 e ausente.
  const grade = [];
  const indice = new Map(rows.map((r) => [`${r.dia}-${r.hora}`, r.valor]));
  for (let dia = 0; dia < 7; dia++) {
    for (let hora = 0; hora < 24; hora++) {
      grade.push({ dia, hora, valor: indice.get(`${dia}-${hora}`) ?? 0 });
    }
  }

  const melhor = grade.reduce((a, b) => (b.valor > a.valor ? b : a), grade[0]);
  return { metrica, grade, melhor: melhor.valor > 0 ? melhor : null };
}

// Progresso nos fluxos por tag: quantos leads alcançaram cada checkpoint.
//
// As etapas saem dos próprios nós de tag dos fluxos — o `step_order` no config
// do nó é o que define a ordem do funil. Sem ele a tag ainda aparece, no fim
// da lista: melhor mostrar fora de ordem do que sumir com a etapa.
//
// (O roteiro previa uma tabela flow_nodes; este projeto guarda os nós em
// flows.definition_json.nodes, então a leitura é sobre o JSONB.)
export async function progressoDosFluxos(workspaceId, flowId) {
  const params = [workspaceId];
  let filtroFluxo = '';
  if (flowId) {
    params.push(flowId);
    filtroFluxo = ' AND f.id = $2';
  }

  const { rows } = await pool.query(
    `WITH etapas AS (
       SELECT n->'config'->>'tag_name' AS tag_name,
              CASE WHEN n->'config'->>'step_order' ~ '^[0-9]+$'
                   THEN (n->'config'->>'step_order')::int END AS step_order
       FROM flows f
       -- O CASE evita que um fluxo sem nodes (ou com nodes em outro formato)
       -- derrube a consulta inteira: jsonb_array_elements explode se o valor
       -- não for array.
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(f.definition_json->'nodes') = 'array'
              THEN f.definition_json->'nodes' ELSE '[]'::jsonb END
       ) n
       WHERE f.workspace_id = $1
         AND n->>'type' = 'tag'
         AND COALESCE(n->'config'->>'tag_name', '') <> ''${filtroFluxo}
     ),
     contagem AS (
       SELECT lt.tag_name, COUNT(DISTINCT lt.lead_id)::int AS total
       FROM lead_tags lt
       JOIN leads l ON l.id = lt.lead_id
       WHERE l.workspace_id = $1
       GROUP BY lt.tag_name
     )
     SELECT e.tag_name,
            MIN(e.step_order)              AS step_order,
            COALESCE(MAX(c.total), 0)::int AS leads
     FROM etapas e
     LEFT JOIN contagem c ON c.tag_name = e.tag_name
     GROUP BY e.tag_name
     ORDER BY MIN(e.step_order) NULLS LAST, e.tag_name`,
    params
  );

  // A primeira etapa é a régua: 100% é "todo mundo que entrou no fluxo", e as
  // seguintes são a fração que sobreviveu até ali.
  const referencia = rows[0]?.leads ?? 0;

  return {
    referencia,
    etapas: rows.map((r) => ({
      tagName: r.tag_name,
      stepOrder: r.step_order,
      leads: r.leads,
      percentual: referencia ? Math.round((r.leads / referencia) * 1000) / 10 : 0,
    })),
  };
}

// Fontes de leads (bloco da tela de Relatórios).
export async function fontesDeLeads(workspaceId, dias) {
  const d = normalizarDias(dias);
  const [de, ate] = janelas(d).atual;

  const { rows } = await pool.query(
    `SELECT source, COUNT(*)::int AS total FROM leads
     WHERE workspace_id = $1 AND ${janelaSql('created_at', de, ate)}
     GROUP BY source ORDER BY total DESC`,
    [workspaceId]
  );
  const total = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({ source: r.source, total: r.total, percentual: pct(r.total, total) }));
}

// Texto interpretativo do bloco "Resumo e recomendações".
//
// Só afirma o que o dado sustenta: quando não há base pra concluir, o card diz
// isso em vez de inventar recomendação.
// `resumoPronto` e `paginasProntas` evitam recalcular: o painel já tem os dois
// em mãos quando chega aqui, e refazer as consultas dobraria o custo da tela.
export async function recomendacoes(workspaceId, dias, resumoPronto, paginasProntas) {
  const r = resumoPronto ?? (await resumo(workspaceId, dias));
  const paginas = paginasProntas ?? (await desempenhoPorPagina(workspaceId, dias));
  const cards = [];

  if (r.atual.enviadas === 0) {
    cards.push({ tipo: 'info', titulo: 'Sem envios no período',
      texto: 'Nenhuma mensagem saiu nesse intervalo. Os números aparecem assim que o primeiro disparo acontecer.' });
    return cards;
  }

  if (r.atual.entregues === 0) {
    cards.push({ tipo: 'alerta', titulo: 'Sem confirmação de entrega',
      texto: 'Saíram ' + r.atual.enviadas + ' mensagens, mas nenhuma confirmação de entrega chegou. ' +
             'Verifique se o webhook está assinando os campos message_deliveries e message_reads no painel do Meta.' });
  } else {
    cards.push({ tipo: r.taxas.entrega >= 90 ? 'bom' : 'alerta', titulo: `Entrega em ${r.taxas.entrega}%`,
      texto: r.taxas.entrega >= 90
        ? 'A entrega está saudável.'
        : 'Abaixo de 90%: costuma indicar leads antigos ou páginas com restrição.' });
  }

  if (r.taxas.falha > 10) {
    cards.push({ tipo: 'alerta', titulo: `${r.taxas.falha}% de falha`,
      texto: 'Falha alta costuma ser app restringido ou token de página vencido. Rode "Escanear todas" nas Páginas.' });
  }

  const melhorPagina = paginas.filter((p) => p.enviadas >= 10)
    .sort((a, b) => b.taxaAbertura - a.taxaAbertura)[0];
  if (melhorPagina) {
    cards.push({ tipo: 'bom', titulo: `${melhorPagina.pageName} tem a melhor abertura`,
      texto: `${melhorPagina.taxaAbertura}% de abertura em ${melhorPagina.enviadas} envios.` });
  }

  if (r.variacao.novosLeads !== 0) {
    const subiu = r.variacao.novosLeads > 0;
    cards.push({ tipo: subiu ? 'bom' : 'alerta',
      titulo: `Novos leads ${subiu ? 'subiram' : 'caíram'} ${Math.abs(r.variacao.novosLeads)}%`,
      texto: `${r.atual.novosLeads} no período contra ${r.anterior.novosLeads} no anterior.` });
  }

  return cards;
}

// Painel inteiro numa chamada — a tela carrega tudo de uma vez.
//
// Tudo em sequência, de propósito. São agregações sobre as mesmas tabelas:
// disparar as nove em paralelo abre nove conexões que disputam o mesmo I/O,
// com ganho pequeno de latência e um pico de conexões a cada carregamento de
// tela. resumo e desempenhoPorPagina são calculados uma vez e reaproveitados
// nas recomendações, que antes refaziam as duas coisas do zero.
export async function painel(workspaceId, dias, metricaMapa) {
  const d = normalizarDias(dias);

  const resumoData = await resumo(workspaceId, d);
  const paginas = await desempenhoPorPagina(workspaceId, d);
  const recomendacoesData = await recomendacoes(workspaceId, d, resumoData, paginas);
  const funilBase = await funilDaBase(workspaceId);
  const funilCampanha = await funilDaCampanha(workspaceId, { dias: d });
  const comentarios = await comentariosPorPagina(workspaceId, d);
  const posts = await postsComMaisComentarios(workspaceId, d);
  const calor = await mapaDeCalor(workspaceId, d, metricaMapa);
  const fontes = await fontesDeLeads(workspaceId, d);

  return {
    ...resumoData,
    recomendacoes: recomendacoesData,
    funilDaBase: funilBase,
    funilDaCampanha: funilCampanha,
    comentariosPorPagina: comentarios,
    postsComMaisComentarios: posts,
    desempenhoPorPagina: paginas,
    mapaDeCalor: calor,
    fontesDeLeads: fontes,
    // A interface mostra isso como aviso: zero em cliques/visualizações pode
    // ser ausência de instrumentação, não ausência de comportamento.
    avisos: {
      cliques: 'Só contam cliques em botões com link, que a ferramenta reescreve pra medir. Link solto no texto da mensagem não é rastreado.',
      visualizacoes: 'Dependem do recibo de leitura do Facebook, que nem sempre chega.',
    },
  };
}
