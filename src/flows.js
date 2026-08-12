import { pool } from './db/pool.js';
import { ValidationError } from './facebookApps.js';
import { getHandler } from './engine/nodes/index.js';
import { normalizarConteudo } from './messageContent.js';
import {
  variaveisDesconhecidas,
  CHAVES,
  contextoDoLead,
  interpolar,
  interpolarConteudo,
} from './variables.js';

// Reexportado para a rota do editor montar o menu de inserir variável a partir
// da mesma lista que a validação usa — duas listas divergiriam.
export { VARIAVEIS } from './variables.js';

// Fluxos: casamento de gatilho, CRUD do editor e simulação de teste.

export const TIPOS_DE_NODE = ['message', 'wait', 'tag', 'condition'];

export const TIPOS_DE_GATILHO = ['exact', 'contains', 'any'];

// Casa o texto de um comentário com uma flow_trigger da página.
//
// Três formas de casar:
//   exact    -> o comentário inteiro é a palavra-chave
//   contains -> a palavra-chave aparece em algum ponto do texto
//   any      -> qualquer comentário serve, sem palavra-chave
//
// Usa position() em vez de ILIKE de propósito: a keyword vem do banco e é
// concatenada no padrão de busca, então com ILIKE um `%` ou `_` dentro dela
// viraria wildcard — a keyword "50% OFF" casaria com qualquer comentário que
// tivesse "50" e "OFF" em qualquer lugar. position() trata a keyword como
// texto literal, sem sintaxe nenhuma pra escapar.
//
// A ordem de prioridade é exact > contains > any: 'any' é a rede de segurança
// da página, então só vale quando nenhum gatilho específico casou — senão ele
// engoliria todos os outros do mesmo fluxo. Empate resolve pelo mais antigo,
// pra a escolha ser sempre a mesma diante do mesmo comentário.
//
// Fluxo desligado não casa: é o que o interruptor da lista significa.
export async function matchKeywordToFlow(pageId, text) {
  const { rows } = await pool.query(
    `SELECT f.*, NULLIF(t.keyword, '') AS matched_keyword, t.match_type
     FROM flow_triggers t
     JOIN flows f ON f.id = t.flow_id
     WHERE t.page_id = $1
       AND f.status = 'active'
       AND t.status = 'active'
       AND t.post_id IS NULL
       AND (
         t.match_type = 'any'
         OR (t.match_type = 'contains' AND t.keyword <> ''
             AND position(lower(t.keyword) in lower($2)) > 0)
         OR (t.match_type = 'exact' AND t.keyword <> ''
             AND lower(btrim($2)) = lower(t.keyword))
       )
     ORDER BY CASE t.match_type WHEN 'exact' THEN 0 WHEN 'contains' THEN 1 ELSE 2 END,
              length(t.keyword) DESC,
              t.created_at ASC
     LIMIT 1`,
    [pageId, text ?? '']
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------------------- CRUD ---

function toPublic(f) {
  return {
    id: f.id,
    name: f.name,
    status: f.status,
    firstNodeId: f.first_node_id,
    nodes: f.definition_json?.nodes ?? [],
    triggers: f.triggers ?? undefined,
    leadsCount: f.leads_count === undefined ? undefined : Number(f.leads_count),
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}

export async function list(workspaceId) {
  const { rows } = await pool.query(
    `SELECT f.*,
            (SELECT COUNT(*) FROM flow_executions e WHERE e.flow_id = f.id)::int AS leads_count,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', t.id, 'pageId', t.page_id,
                 'keyword', NULLIF(t.keyword, ''), 'matchType', t.match_type)
               ORDER BY t.created_at)
               FROM flow_triggers t WHERE t.flow_id = f.id),
              '[]'::json
            ) AS triggers
     FROM flows f
     WHERE f.workspace_id = $1
     ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC`,
    [workspaceId]
  );
  return rows.map(toPublic);
}

export async function get(workspaceId, id) {
  const { rows } = await pool.query(
    `SELECT f.*,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', t.id, 'pageId', t.page_id,
                 'keyword', NULLIF(t.keyword, ''), 'matchType', t.match_type)
               ORDER BY t.created_at)
               FROM flow_triggers t WHERE t.flow_id = f.id),
              '[]'::json
            ) AS triggers
     FROM flows f WHERE f.workspace_id = $1 AND f.id = $2`,
    [workspaceId, id]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

// Valida o desenho antes de gravar.
//
// O motor lê os nós por id e segue next_node_id; um ponteiro pra um id que não
// existe só apareceria como execução 'failed' lá na frente, com o lead no meio
// do caminho. É mais barato recusar aqui.
export function validarNodes(nodes, firstNodeId) {
  if (!Array.isArray(nodes) || !nodes.length) {
    throw new ValidationError('O fluxo precisa de pelo menos um bloco');
  }

  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) throw new ValidationError('Todo bloco precisa de um id');
    if (ids.has(n.id)) throw new ValidationError(`Bloco duplicado: "${n.id}"`);
    ids.add(n.id);

    if (!TIPOS_DE_NODE.includes(n.type)) {
      throw new ValidationError(`Tipo de bloco desconhecido: "${n.type}"`);
    }

    const c = n.config ?? {};
    if (n.type === 'message' && !normalizarConteudo(c).partes.length) {
      throw new ValidationError('Bloco de mensagem sem conteúdo');
    }
    if (n.type === 'message') {
      // Variável escrita errada é barata de corrigir aqui e cara depois: no
      // envio ela sai literal — "Olá {{fist_name}}" chega assim no lead.
      const textos = [
        ...(normalizarConteudo(c).partes.filter((p) => p.type === 'texto').map((p) => p.text)),
        ...(c.buttons ?? []).map((b) => b?.title),
        ...(c.quickReplies ?? []).map((q) => q?.title),
      ];
      const desconhecidas = [...new Set(textos.flatMap((t) => variaveisDesconhecidas(t)))];
      if (desconhecidas.length) {
        throw new ValidationError(
          `Variável desconhecida: ${desconhecidas.map((v) => `{{${v}}}`).join(', ')}. ` +
          `Disponíveis: ${CHAVES.map((k) => `{{${k}}}`).join(', ')}`
        );
      }
    }
    if (n.type === 'wait' && !(Number(c.duration_seconds) > 0)) {
      throw new ValidationError('Bloco de espera precisa de uma duração maior que zero');
    }
    if (n.type === 'tag' && !c.tag_name?.trim()) {
      throw new ValidationError('Bloco de tag sem nome de tag');
    }
    if (n.type === 'condition' && !c.tag_to_check?.trim()) {
      throw new ValidationError('Bloco de condição sem tag para verificar');
    }
  }

  if (!firstNodeId || !ids.has(firstNodeId)) {
    throw new ValidationError('O fluxo precisa começar por um bloco existente');
  }

  for (const n of nodes) {
    const alvos = [n.next_node_id, n.config?.true_branch_node_id, n.config?.false_branch_node_id];
    for (const alvo of alvos) {
      if (alvo && !ids.has(alvo)) {
        throw new ValidationError(`O bloco "${n.id}" aponta para um bloco que não existe`);
      }
    }
  }
}

export async function create(workspaceId, input) {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('name é obrigatório');

  const nodes = input.nodes ?? [];
  const firstNodeId = input.firstNodeId ?? nodes[0]?.id ?? null;

  // Fluxo novo pode nascer vazio (o editor salva antes de ter blocos); a
  // validação de desenho só entra quando há o que validar.
  if (nodes.length) validarNodes(nodes, firstNodeId);

  const { rows } = await pool.query(
    `INSERT INTO flows (workspace_id, name, first_node_id, definition_json, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspaceId, name, firstNodeId ?? '', JSON.stringify({ nodes }), input.status ?? 'active']
  );
  return toPublic(rows[0]);
}

export async function update(workspaceId, id, input) {
  if (input.status && !['active', 'inactive'].includes(input.status)) {
    throw new ValidationError(`status inválido: ${input.status}`);
  }

  const mexeNoDesenho = Array.isArray(input.nodes);
  let firstNodeId = null;
  if (mexeNoDesenho) {
    firstNodeId = input.firstNodeId ?? input.nodes[0]?.id ?? null;
    if (input.nodes.length) validarNodes(input.nodes, firstNodeId);
  }

  const { rows } = await pool.query(
    `UPDATE flows
     SET name            = COALESCE($3, name),
         status          = COALESCE($4, status),
         definition_json = CASE WHEN $5::boolean THEN $6::jsonb ELSE definition_json END,
         first_node_id   = CASE WHEN $5::boolean THEN $7 ELSE first_node_id END,
         updated_at      = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [
      workspaceId, id,
      input.name?.trim() ?? null,
      input.status ?? null,
      mexeNoDesenho,
      mexeNoDesenho ? JSON.stringify({ nodes: input.nodes }) : null,
      firstNodeId ?? '',
    ]
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function remove(workspaceId, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM flow_executions WHERE flow_id = $1', [id]
  );
  if (rows[0].total > 0) {
    throw new ValidationError(
      `Este fluxo tem ${rows[0].total} execução(ões) no histórico. Desligue-o em vez de excluir.`
    );
  }
  await pool.query('DELETE FROM flow_triggers WHERE flow_id = $1', [id]);
  const res = await pool.query(
    'DELETE FROM flows WHERE workspace_id = $1 AND id = $2', [workspaceId, id]
  );
  return res.rowCount > 0;
}

// --------------------------------------------------------------- gatilhos ---

async function exigirFluxo(workspaceId, flowId) {
  const { rows } = await pool.query(
    'SELECT id FROM flows WHERE workspace_id = $1 AND id = $2', [workspaceId, flowId]
  );
  if (!rows[0]) throw new ValidationError('Fluxo não encontrado');
}

export async function addTrigger(workspaceId, flowId, { pageId, keyword, matchType }) {
  await exigirFluxo(workspaceId, flowId);

  const tipo = matchType ?? 'contains';
  if (!TIPOS_DE_GATILHO.includes(tipo)) {
    throw new ValidationError(`matchType inválido: ${matchType}`);
  }
  if (!pageId) throw new ValidationError('Escolha a página do gatilho');

  // Em 'any' a palavra-chave não existe — guardar o que o operador digitou
  // antes de trocar o tipo faria a lista mostrar uma keyword que não é usada.
  const kw = tipo === 'any' ? '' : (keyword?.trim() ?? '');
  if (tipo !== 'any' && !kw) throw new ValidationError('A palavra-chave não pode ser vazia');

  try {
    const { rows } = await pool.query(
      `INSERT INTO flow_triggers (flow_id, page_id, keyword, match_type)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [flowId, pageId, kw, tipo]
    );
    return {
      id: rows[0].id,
      pageId: rows[0].page_id,
      keyword: rows[0].keyword || null,
      matchType: rows[0].match_type,
    };
  } catch (err) {
    if (err.code === '23505') {
      // O índice é por (página, post, keyword): duas regras casando o mesmo
      // comentário seria ambiguidade, mesmo apontando pra fluxos diferentes.
      throw new ValidationError(
        tipo === 'any'
          ? 'Já existe uma regra para qualquer comentário nessa página'
          : `Já existe uma regra para "${kw}" nessa página`
      );
    }
    throw err;
  }
}

export async function removeTrigger(workspaceId, flowId, triggerId) {
  await exigirFluxo(workspaceId, flowId);
  const res = await pool.query(
    'DELETE FROM flow_triggers WHERE flow_id = $1 AND id = $2', [flowId, triggerId]
  );
  return res.rowCount > 0;
}

// -------------------------------------------------------------- simulação ---

// Executa o fluxo contra um lead SEM enviar nada e SEM gravar nada.
//
// Reaproveita os handlers de verdade (src/engine/nodes) com dependências
// falsas: um messenger que só anota e um `leads` que opera sobre um conjunto
// de tags em memória. Reescrever a lógica aqui faria o teste divergir do que
// o motor realmente faz — que é exatamente o que ninguém quer descobrir em
// produção.
export async function simular(workspaceId, flowId, opcoes) {
  // Aceita string (leadId) por compatibilidade com chamadas anteriores.
  const opcoesDeTeste = typeof opcoes === 'string' ? { leadId: opcoes } : (opcoes ?? {});
  const { pageId, leadId } = opcoesDeTeste;

  const flow = await get(workspaceId, flowId);
  if (!flow) throw new ValidationError('Fluxo não encontrado');
  if (!flow.nodes.length) throw new ValidationError('Este fluxo ainda não tem blocos');

  let lead;
  let tags;
  let pagina = null;

  if (leadId) {
    const { rows } = await pool.query(
      'SELECT * FROM leads WHERE workspace_id = $1 AND id = $2', [workspaceId, leadId]
    );
    lead = rows[0];
    if (!lead) throw new ValidationError('Lead não encontrado');

    const { rows: tagRows } = await pool.query(
      'SELECT tag_name FROM lead_tags WHERE lead_id = $1', [leadId]
    );
    // Cópia em memória: o teste não pode carimbar tag de verdade no lead.
    tags = new Set(tagRows.map((t) => t.tag_name));
  } else {
    // Teste pela PÁGINA: o operador escolhe onde o fluxo vai rodar e a
    // simulação usa um lead fictício, sem tag nenhuma — é o que o fluxo vai
    // encontrar quando alguém novo comentar. Testar com um lead da base
    // esconderia isso, porque ele já vem com tags de execuções anteriores.
    if (!pageId) throw new ValidationError('Escolha a página para testar');

    const { rows } = await pool.query(
      `SELECT * FROM facebook_pages WHERE workspace_id = $1 AND page_id = $2 LIMIT 1`,
      [workspaceId, pageId]
    );
    pagina = rows[0];
    if (!pagina) throw new ValidationError('Página não encontrada neste workspace');

    lead = {
      id: null, name: 'Lead de teste', psid: 'teste',
      page_id: pageId, workspace_id: workspaceId,
    };
    tags = new Set();
  }

  // O mesmo contexto que o canal monta no envio real. Sem isso o teste
  // mostraria "Olá {{first_name}}" e o lead receberia "Olá Ana" — uma prévia
  // que não prevê nada.
  const contexto = contextoDoLead(lead, {
    pageName: pagina?.name,
    keyword: opcoesDeTeste.keyword,
    comment: opcoesDeTeste.comment,
  });

  const passos = [];
  const messengerFalso = {
    async send(_lead, text, buttons) {
      passos.push({ tipo: 'mensagem', text: interpolar(text, contexto), buttons: buttons ?? null });
    },
    // Cada parte do bloco vira um passo próprio: é assim que a pessoa vai
    // receber (mensagens separadas), e juntar tudo num balão só faria o teste
    // mostrar uma conversa diferente da real.
    async sendRich(_lead, config) {
      const { partes, botoes, respostasRapidas } =
        normalizarConteudo(interpolarConteudo(config, contexto));
      partes.forEach((parte, i) => {
        const ultima = i === partes.length - 1;
        passos.push({
          tipo: 'mensagem',
          parte: parte.type,
          text: parte.type === 'texto' ? parte.text : null,
          url: parte.type === 'texto' ? null : parte.url,
          // Botões só aparecem no último texto e respostas rápidas na última
          // mensagem — igual ao que a Send API impõe no envio real.
          buttons: (parte.type === 'texto' && i === partes.map((p) => p.type).lastIndexOf('texto'))
            ? (botoes.length ? botoes : null)
            : null,
          quickReplies: ultima && respostasRapidas.length ? respostasRapidas : null,
        });
      });
    },
  };
  const leadsFalso = {
    async addTag(_id, tag) { tags.add(tag); },
    async removeTag(_id, tag) { tags.delete(tag); },
    async hasTag(_id, tag) { return tags.has(tag); },
  };

  const porId = new Map(flow.nodes.map((n) => [n.id, n]));
  let atual = flow.firstNodeId;
  let guarda = 0;

  while (atual) {
    if (++guarda > 60) {
      passos.push({ tipo: 'erro', texto: 'Parei em 60 passos — o fluxo parece ter um ciclo.' });
      break;
    }

    const node = porId.get(atual);
    if (!node) {
      passos.push({ tipo: 'erro', texto: `O bloco "${atual}" não existe no fluxo.` });
      break;
    }

    const execucaoFalsa = { id: 'simulacao', lead_id: lead.id, context_json: {}, status: 'running' };

    try {
      const antes = passos.length;
      const r = await getHandler(node.type).execute(execucaoFalsa, node, {
        messenger: messengerFalso, lead, leads: leadsFalso,
      });

      // Cada passo carrega o nodeId pra interface acender o bloco certo no canvas.
      for (let i = antes; i < passos.length; i++) passos[i].nodeId = node.id;

      if (node.type === 'wait') {
        passos.push({
          tipo: 'espera', nodeId: node.id,
          segundos: Number(node.config?.duration_seconds ?? 0),
        });
        // Na simulação não se espera de verdade: o handler devolve 'waiting'
        // sem próximo nó, e quem retoma no motor real é o poller.
        atual = node.next_node_id ?? null;
        continue;
      }

      if (node.type === 'tag') {
        passos.push({ tipo: 'tag', nodeId: node.id, tag: node.config?.tag_name });
      }
      if (node.type === 'condition') {
        const tag = node.config?.tag_to_check;
        passos.push({
          tipo: 'condicao', nodeId: node.id, tag,
          resultado: tags.has(tag),
          caminho: tags.has(tag) ? 'tem a tag' : 'não tem a tag',
        });
      }

      atual = r.nextNodeId ?? null;
    } catch (err) {
      passos.push({ tipo: 'erro', nodeId: node.id, texto: err.message });
      break;
    }
  }

  return {
    lead: { id: lead.id, name: lead.name, psid: lead.psid },
    pagina: pagina
      ? { pageId: pagina.page_id, name: pagina.name, avatarUrl: pagina.avatar_url }
      : null,
    passos,
    tagsFinais: [...tags],
    // Deixa explícito que nada saiu: sem isso é fácil confundir teste com envio.
    aviso: 'Simulação: nenhuma mensagem foi enviada e nenhuma tag foi gravada no lead.',
  };
}
