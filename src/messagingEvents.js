import { pool } from './db/pool.js';
import { leads } from './leads.js';

// Eventos do campo `messaging` do webhook: entrega, leitura e mensagem
// recebida.
//
// Sem tratar isso, messages.status ficaria em 'sent' pra sempre e os cards
// "Entregues hoje" e "Abriram a mensagem hoje" seriam zero permanente — não
// porque ninguém recebeu, mas porque ninguém escutou.

// Extrai os eventos de messaging de um payload de webhook.
export function extractMessagingEvents(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    const pageId = String(entry.id);
    for (const evento of entry.messaging ?? []) {
      const psid = evento.sender?.id ? String(evento.sender.id) : null;
      if (!psid) continue;

      // Echo é a própria página aparecendo como remetente do que ela mandou.
      if (evento.message?.is_echo) continue;

      if (evento.delivery) {
        out.push({ tipo: 'delivery', pageId, psid, watermark: evento.delivery.watermark,
                   mids: evento.delivery.mids ?? [] });
      } else if (evento.read) {
        out.push({ tipo: 'read', pageId, psid, watermark: evento.read.watermark });
      } else if (evento.message) {
        out.push({ tipo: 'message', pageId, psid, text: evento.message.text ?? null });
      }
    }
  }
  return out;
}

async function acharLead(psid, pageId) {
  const { rows } = await pool.query(
    'SELECT * FROM leads WHERE psid = $1 AND page_id = $2', [psid, pageId]
  );
  return rows[0] ?? null;
}

// A Meta manda um watermark (timestamp): "tudo que você enviou pra esta pessoa
// até este instante foi entregue/lido". Os mids vêm só na entrega e nem sempre.
// Por isso a atualização é por watermark, com os mids como reforço.
//
// O CASE nos status impede regressão: uma entrega que chega depois da leitura
// (fora de ordem, o que acontece) não pode rebaixar 'read' para 'delivered'.
async function marcarEntregues(leadId, watermark, mids) {
  const { rowCount } = await pool.query(
    `UPDATE messages
     SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
     WHERE lead_id = $1
       AND status = 'sent'
       AND (sent_at <= to_timestamp($2::bigint / 1000.0) OR mid = ANY($3::text[]))`,
    [leadId, watermark ?? 0, mids ?? []]
  );
  return rowCount;
}

async function marcarLidas(leadId, watermark) {
  const { rowCount } = await pool.query(
    `UPDATE messages
     SET status = 'read',
         read_at = COALESCE(read_at, now()),
         delivered_at = COALESCE(delivered_at, now())
     WHERE lead_id = $1
       AND status IN ('sent', 'delivered')
       AND sent_at <= to_timestamp($2::bigint / 1000.0)`,
    [leadId, watermark ?? 0]
  );
  return rowCount;
}

export async function handleMessagingEvent(evento) {
  const lead = await acharLead(evento.psid, evento.pageId);
  // Entrega/leitura de alguém que não é lead nosso: nada a atualizar.
  if (!lead) return { status: 'sem_lead' };

  if (evento.tipo === 'delivery') {
    const n = await marcarEntregues(lead.id, evento.watermark, evento.mids);
    return { status: 'delivered', mensagens: n };
  }

  if (evento.tipo === 'read') {
    const n = await marcarLidas(lead.id, evento.watermark);
    return { status: 'read', mensagens: n };
  }

  // Mensagem recebida: é a interação que reabre a janela de 24h e reabilita o
  // lead pra envio livre. Sem isso, quem responde continuaria contando como
  // fora da janela.
  await leads.touchInteraction(lead.id);
  await pool.query(
    'UPDATE leads SET messaging_opened_at = COALESCE(messaging_opened_at, now()) WHERE id = $1',
    [lead.id]
  );
  return { status: 'interaction' };
}

export async function handleMessagingPayload(body) {
  const eventos = extractMessagingEvents(body);
  for (const evento of eventos) {
    try {
      await handleMessagingEvent(evento);
    } catch (err) {
      console.error(`[webhook] falha no evento ${evento.tipo} de ${evento.psid}:`, err);
    }
  }
  return eventos.length;
}
