import { resolveChannel } from './channels/index.js';

// Fachada de envio usada pelos node handlers. Eles não sabem (nem precisam
// saber) por qual canal a mensagem sai — só que `send` entrega ou lança.
export const messenger = {
  async send(lead, text, buttons, ctx) {
    const channel = resolveChannel(lead);
    return channel.send(lead, text, buttons, ctx);
  },

  // Conteúdo de um bloco inteiro: várias partes (texto, imagem, áudio, vídeo)
  // mais botões e respostas rápidas.
  async sendRich(lead, config, ctx) {
    const channel = resolveChannel(lead);
    return channel.sendRich(lead, config, ctx);
  },
};
