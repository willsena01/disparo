import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baseUrl } from './facebookOAuth.js';

// Onde as mídias dos blocos de mensagem ficam guardadas.
//
// A escolha não é estética: em hospedagem serverless (Vercel) o disco é
// somente-leitura fora de /tmp, e /tmp some entre invocações. Gravar no disco
// ali significa a imagem funcionar no teste e sumir no primeiro disparo.
//
// Por isso existem dois modos, escolhidos por ambiente:
//   disco  — servidor comum (padrão)
//   blob   — Vercel Blob, quando BLOB_READ_WRITE_TOKEN está definido

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PASTA_UPLOADS = process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads');

export const modoDeArmazenamento = process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'disco';

// Nome aleatório: usar o original permitiria um upload sobrescrever outro e
// revelaria o nome do arquivo de quem subiu.
export function nomeAleatorio(nomeOriginal) {
  const ext = path.extname(nomeOriginal ?? '').slice(0, 10).replace(/[^.\w]/g, '');
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

// Guarda o arquivo e devolve a URL pública — é ela que a Meta vai buscar.
export async function guardar(buffer, { nomeOriginal, mimetype }) {
  const nome = nomeAleatorio(nomeOriginal);

  if (modoDeArmazenamento === 'blob') {
    // Import dinâmico: quem roda em servidor comum não precisa ter o pacote
    // instalado, e o require estático quebraria o boot.
    const { put } = await import('@vercel/blob');
    const { url } = await put(`disparo/${nome}`, buffer, {
      access: 'public',
      contentType: mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return { url, nome };
  }

  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(PASTA_UPLOADS, nome), buffer);
  return { url: `${baseUrl()}/uploads/${nome}`, nome };
}

// Aviso para a tela de Configurações: em serverless, disco local perde arquivo.
export function avisoDeArmazenamento() {
  if (modoDeArmazenamento === 'blob') return null;
  if (!process.env.VERCEL) return null;
  return (
    'Os arquivos estão indo para o disco local, que na Vercel é apagado a cada invocação — ' +
    'as mídias dos fluxos vão sumir. Configure BLOB_READ_WRITE_TOKEN (Vercel Blob) antes de usar ' +
    'imagem, áudio ou vídeo nos blocos.'
  );
}
