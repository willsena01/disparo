import crypto from 'node:crypto';
import { pool } from './db/pool.js';
import { baseUrl } from './facebookOAuth.js';

// Rastreamento de clique.
//
// A Meta não informa clique em link — quem sabe que alguém clicou é só o
// redirecionador. Por isso o botão sai da ferramenta apontando pra cá, e daqui
// a pessoa segue pro destino real. Sem isso, "cliques" no relatório seria zero
// pra sempre, não porque ninguém clicou, mas porque ninguém mediu.
//
// Só os BOTÕES são reescritos: eles têm a URL num campo estruturado. Link
// solto no meio do texto exigiria adivinhar o que é URL dentro da frase, e
// errar isso significa quebrar a mensagem que o cliente escreveu.

export function urlDeRastreio(token) {
  return `${baseUrl()}/r/${token}`;
}

// Cria um link rastreado por botão e devolve os botões já reescritos.
// Se algo faltar (sem workspace, sem lead), devolve os botões originais — a
// mensagem sair sem métrica é muito melhor do que não sair.
export async function rastrearBotoes(buttons, { workspaceId, leadId, broadcastId, executionId }) {
  if (!buttons?.length || !workspaceId || !leadId) return buttons;

  const saida = [];
  for (const b of buttons) {
    if (!b.url) {
      saida.push(b);
      continue;
    }
    const token = crypto.randomBytes(9).toString('base64url');
    await pool.query(
      `INSERT INTO tracked_links
         (token, workspace_id, lead_id, broadcast_id, flow_execution_id, target_url)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [token, workspaceId, leadId, broadcastId ?? null, executionId ?? null, b.url]
    );
    saida.push({ ...b, url: urlDeRastreio(token) });
  }
  return saida;
}

export async function buscarLink(token) {
  const { rows } = await pool.query('SELECT * FROM tracked_links WHERE token = $1', [token]);
  return rows[0] ?? null;
}

// Cada clique é uma linha: a mesma pessoa pode clicar duas vezes, e os funis
// contam lead distinto, não clique.
//
// Separado do redirecionamento de propósito: quem chama redireciona primeiro e
// grava depois. Perder uma métrica é aceitável; deixar a pessoa numa página de
// erro depois de ela clicar no seu anúncio, não.
export async function registrarClique(link) {
  await pool.query(
    'INSERT INTO link_clicks (tracked_link_id, lead_id) VALUES ($1, $2)',
    [link.id, link.lead_id]
  );
}
