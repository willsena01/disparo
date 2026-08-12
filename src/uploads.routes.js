import express from 'express';
import multer from 'multer';
import { PASTA_UPLOADS, guardar } from './storage.js';


// Upload de mídia dos blocos de mensagem.
//
// A Meta não recebe o arquivo: ela BUSCA o arquivo numa URL pública. Então o
// upload aqui existe pra transformar o arquivo do operador numa URL — quem
// hospeda somos nós (disco local ou Vercel Blob, ver src/storage.js).

// Tipos que a Send API aceita como anexo. Recusar aqui é melhor do que
// descobrir na hora do disparo, com o lead esperando.
const TIPOS_ACEITOS = {
  imagem: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/aac'],
  video: ['video/mp4', 'video/quicktime'],
};

// Limite da Meta para anexo buscado por URL.
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

// memoryStorage e não diskStorage: o destino final pode ser o Blob, e em
// serverless não há disco pra usar como estação intermediária.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: 1 },
  fileFilter: (req, file, cb) => {
    const tipo = req.query.tipo;
    const aceitos = TIPOS_ACEITOS[tipo];
    if (!aceitos) return cb(new Error(`tipo inválido: use ${Object.keys(TIPOS_ACEITOS).join(', ')}`));
    if (!aceitos.includes(file.mimetype)) {
      return cb(new Error(`A Meta não aceita "${file.mimetype}" como ${tipo}. Aceitos: ${aceitos.join(', ')}`));
    }
    cb(null, true);
  },
});

export const uploadsRouter = express.Router();

uploadsRouter.post('/', (req, res) => {
  upload.single('arquivo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo acima de 25 MB — é o limite da Meta para anexo.'
        : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    try {
      const { url } = await guardar(req.file.buffer, {
        nomeOriginal: req.file.originalname,
        mimetype: req.file.mimetype,
      });
      res.status(201).json({
        url,
        nome: req.file.originalname,
        tamanho: req.file.size,
        mimetype: req.file.mimetype,
      });
    } catch (erroAoGuardar) {
      console.error('[uploads]', erroAoGuardar);
      // Falha de configuração é 503 com o motivo: tentar de novo não resolve, e
      // esconder a causa atrás de "não foi possível" deixa o operador sem saída.
      if (erroAoGuardar.deConfiguracao) {
        return res.status(503).json({ error: erroAoGuardar.message });
      }
      res.status(500).json({ error: 'Não foi possível guardar o arquivo' });
    }
  });
});

// Servidor estático dos arquivos enviados (só usado no modo disco).
export const uploadsStatic = express.static(PASTA_UPLOADS, {
  // Os nomes são aleatórios e imutáveis, então cache longo é seguro.
  maxAge: '30d',
  index: false,
  dotfiles: 'ignore',
});

export { PASTA_UPLOADS };
