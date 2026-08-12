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

// Token de escrita do Vercel Blob.
//
// Ao conectar a store, a Vercel deixa escolher um PREFIXO para as variáveis.
// Com o prefixo padrão sai BLOB_READ_WRITE_TOKEN; com "MIDIA" sai
// MIDIA_READ_WRITE_TOKEN. E o prefixo padrão às vezes está ocupado por uma
// store anterior, forçando outro nome. Exigir um nome exato faria uma escolha
// do painel quebrar o upload sem nenhum motivo técnico — então aceitamos
// qualquer variável terminada em _READ_WRITE_TOKEN.
export function tokenDoBlob() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const chave = Object.keys(process.env)
    .filter((k) => k.endsWith('_READ_WRITE_TOKEN') && process.env[k])
    // Ordem alfabética só para o resultado não depender da ordem do ambiente:
    // com duas stores conectadas, a escolha precisa ser sempre a mesma.
    .sort()[0];
  return chave ? process.env[chave] : null;
}

export const modoDeArmazenamento = tokenDoBlob() ? 'blob' : 'disco';

// Nome aleatório: usar o original permitiria um upload sobrescrever outro e
// revelaria o nome do arquivo de quem subiu.
export function nomeAleatorio(nomeOriginal) {
  const ext = path.extname(nomeOriginal ?? '').slice(0, 10).replace(/[^.\w]/g, '');
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

// Falha que o operador resolve mexendo na configuração, não tentando de novo.
// Separada do erro genérico para a rota poder responder o motivo em vez de
// "não foi possível" — que não diz o que fazer.
export class ErroDeArmazenamento extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeArmazenamento';
    this.deConfiguracao = true;
  }
}

// Motivo pelo qual o upload NÃO vai funcionar neste ambiente, ou null.
//
// Em serverless sem Vercel Blob não adianta tentar: o disco é somente-leitura
// fora de /tmp, e /tmp some entre invocações. Antes isto era só um aviso que
// ninguém chamava — o upload ia até o mkdir e voltava com erro genérico.
export function problemaDeArmazenamento() {
  if (modoDeArmazenamento === 'blob') return null;
  if (!process.env.VERCEL) return null;
  return (
    'O envio de arquivo precisa do Vercel Blob para funcionar aqui: na Vercel o disco é ' +
    'somente-leitura e o que for gravado some na invocação seguinte. Crie um Blob Store em ' +
    'Storage no painel da Vercel, conecte ao projeto marcando "Add a read-write token env var", ' +
    'e faça o redeploy. Serve qualquer variável terminada em _READ_WRITE_TOKEN. ' +
    'Enquanto isso, use “ou usar um link” com o arquivo hospedado em outro lugar.'
  );
}

// Guarda o arquivo e devolve a URL pública — é ela que a Meta vai buscar.
export async function guardar(buffer, { nomeOriginal, mimetype }) {
  const impedimento = problemaDeArmazenamento();
  if (impedimento) throw new ErroDeArmazenamento(impedimento);

  const nome = nomeAleatorio(nomeOriginal);

  if (modoDeArmazenamento === 'blob') {
    // Import dinâmico: quem roda em servidor comum não precisa ter o pacote
    // instalado, e o require estático quebraria o boot.
    const { put } = await import('@vercel/blob');
    const { url } = await put(`disparo/${nome}`, buffer, {
      access: 'public',
      contentType: mimetype,
      token: tokenDoBlob(),
      addRandomSuffix: false,
    });
    return { url, nome };
  }

  try {
    fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(PASTA_UPLOADS, nome), buffer);
  } catch (err) {
    // Traduz o erro do sistema de arquivos para algo acionável. O código cru
    // (EROFS, EACCES) não diz a ninguém o que fazer a seguir.
    const porCodigo = {
      EROFS: 'a pasta de uploads está num disco somente-leitura',
      EACCES: 'o servidor não tem permissão de escrita na pasta de uploads',
      EPERM: 'o servidor não tem permissão de escrita na pasta de uploads',
      ENOSPC: 'não há espaço em disco',
    };
    const motivo = porCodigo[err.code];
    if (!motivo) throw err;
    throw new ErroDeArmazenamento(
      `Não deu para gravar o arquivo: ${motivo} (${PASTA_UPLOADS}). ` +
      'Ajuste UPLOADS_DIR para uma pasta gravável ou configure o Vercel Blob.'
    );
  }
  return { url: `${baseUrl()}/uploads/${nome}`, nome };
}
