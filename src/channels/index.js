import { messengerChannel } from './messenger.channel.js';

// Registro de canais de envio. O canal é escolhido pelo que o lead tem como
// endereço, não por configuração do node — assim um mesmo fluxo atende leads
// de origens diferentes, e adicionar WhatsApp/Instagram depois é registrar
// mais um canal aqui, sem tocar nos node handlers.
//
// Contrato de um canal:
//   name           — identificador
//   supports(lead) — sabe endereçar esse lead?
//   send(lead, text, buttons, ctx) — envia; lança em caso de falha
export const channels = [messengerChannel];

export function resolveChannel(lead) {
  const channel = channels.find((c) => c.supports(lead));
  if (!channel) {
    throw new Error(
      `Nenhum canal sabe enviar para o lead ${lead?.id} — ` +
        'esperado psid + page_id (Messenger)'
    );
  }
  return channel;
}
