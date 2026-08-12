import crypto from 'node:crypto';
import express from 'express';
import { pool } from './db/pool.js';
import { getDefaultWorkspaceId } from './workspace.js';
import {
  baseUrl,
  redirectUri,
  SCOPES,
  SCOPES_ESSENCIAIS,
  CAMPOS_DO_WEBHOOK,
} from './facebookOAuth.js';
import { dadosDaEmpresa, identificacaoCompleta } from './legal.js';
import { modoDeArmazenamento, problemaDeArmazenamento } from './storage.js';

// Tudo que precisa ser colado no painel do Meta for Developers, e o callback
// de exclusão de dados que a Meta exige pra aprovar o app.

export const settingsRouter = express.Router();
settingsRouter.use(express.json());

// URLs e valores de configuração. Cada uma diz onde vai no painel do Meta —
// sem isso o operador tem cinco campos parecidos e nenhuma pista de qual é qual.
settingsRouter.get('/urls', async (_req, res) => {
  const base = baseUrl();
  const emHttps = base.startsWith('https://');

  res.json({
    baseUrl: base,
    // A Meta recusa http e localhost: o webhook precisa ser alcançável por ela.
    prontoParaProducao: emHttps,
    avisoUrl: emHttps
      ? null
      : 'A Meta só aceita HTTPS público. Enquanto APP_BASE_URL apontar para localhost ou http, ' +
        'ela não vai conseguir chamar o webhook — use um túnel (ngrok/cloudflared) ou publique.',
    campos: [
      {
        chave: 'webhookUrl',
        rotulo: 'Callback URL do Webhook',
        valor: `${base}/api/webhook`,
        onde: 'Meta for Developers → Webhooks → Page → Callback URL',
      },
      {
        chave: 'oauthRedirect',
        rotulo: 'OAuth Redirect URI',
        valor: redirectUri(),
        onde: 'Login do Facebook → Configurações → URIs de redirecionamento do OAuth válidos',
      },
      {
        chave: 'siteUrl',
        rotulo: 'URL do site',
        valor: base,
        onde: 'Configurações → Básico → URL do site',
      },
      {
        chave: 'privacidade',
        rotulo: 'Política de Privacidade',
        valor: `${base}/privacidade`,
        onde: 'Configurações → Básico → URL da Política de Privacidade',
        // A página existe e descreve o que a ferramenta faz; o que pode faltar
        // é quem responde por ela.
        precisaDeIdentificacao: !identificacaoCompleta(),
      },
      {
        chave: 'termos',
        rotulo: 'Termos de Serviço',
        valor: `${base}/termos`,
        onde: 'Configurações → Básico → URL dos Termos de Serviço',
        precisaDeIdentificacao: !identificacaoCompleta(),
      },
      {
        chave: 'exclusaoDeDados',
        rotulo: 'Callback de Exclusão de Dados',
        valor: `${base}/api/data-deletion`,
        onde: 'Configurações → Básico → URL de callback de exclusão de dados',
      },
    ],
    permissoes: SCOPES,
    // Pedir uma permissão que o app não tem faz o Facebook recusar o login
    // inteiro ("Invalid Scopes"). Quando isso acontece o caminho é habilitar a
    // permissão no caso de uso do app — ou, para destravar já, reduzir a lista
    // em FB_SCOPES. Aqui a tela mostra o que está sendo pedido e avisa se a
    // redução foi longe demais.
    permissoesFaltando: SCOPES_ESSENCIAIS.filter((s) => !SCOPES.includes(s)),
    camposDoWebhook: CAMPOS_DO_WEBHOOK,
    // Onde as mídias dos blocos são guardadas. Aparece aqui para o problema ser
    // descoberto ao configurar, e não no meio da montagem de um fluxo.
    armazenamento: {
      modo: modoDeArmazenamento,
      problema: problemaDeArmazenamento(),
    },
    empresa: {
      ...dadosDaEmpresa(),
      completa: identificacaoCompleta(),
      // Só o operador sabe quem responde legalmente pelo tratamento dos dados;
      // publicar uma política sem controlador identificado reprova na revisão.
      aviso: identificacaoCompleta()
        ? null
        : 'A Política de Privacidade e os Termos já estão publicados e descrevem o que a ferramenta ' +
          'faz, mas ainda não dizem quem responde por eles. Defina EMPRESA_NOME e EMPRESA_EMAIL ' +
          '(e, se houver, EMPRESA_DOC e EMPRESA_ENDERECO) no .env antes de enviar o app para revisão.',
    },
  });
});

// ------------------------------------------------------- exclusão de dados ---

// A Meta assina o payload com o App Secret. Como a mesma URL atende todos os
// apps, testamos contra cada secret — o que casar identifica o app de origem.
// (Mesma lógica da assinatura do webhook.)
function decodificarSignedRequest(signedRequest, appSecret) {
  const [assinatura, payload] = String(signedRequest ?? '').split('.');
  if (!assinatura || !payload) return null;

  const esperada = crypto.createHmac('sha256', appSecret).update(payload).digest();
  const recebida = Buffer.from(assinatura.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function apagarDadosDoUsuario(facebookUserId) {
  // O id que a Meta manda é escopado por app; nos nossos dados ele é o psid do
  // lead. Apagar o lead leva junto tags, cliques e destinatários de campanha
  // (ON DELETE CASCADE); mensagens e comentários ficam, mas anonimizados.
  await pool.query(
    `UPDATE comments SET commenter_name = NULL, comment_text = NULL, commenter_psid = NULL
     WHERE commenter_psid = $1`,
    [facebookUserId]
  );
  const res = await pool.query('DELETE FROM leads WHERE psid = $1', [facebookUserId]);
  return res.rowCount;
}

settingsRouter.post('/data-deletion', express.urlencoded({ extended: false }), async (req, res) => {
  const signed = req.body?.signed_request ?? req.query?.signed_request;

  try {
    const { rows: apps } = await pool.query('SELECT * FROM facebook_apps');
    let dados = null;
    let app = null;
    for (const a of apps) {
      dados = decodificarSignedRequest(signed, a.app_secret);
      if (dados) { app = a; break; }
    }

    if (!dados?.user_id) {
      return res.status(400).json({ error: 'signed_request ausente ou inválido' });
    }

    const codigo = crypto.randomBytes(10).toString('hex');
    const removidos = await apagarDadosDoUsuario(String(dados.user_id));

    await pool.query(
      `INSERT INTO data_deletion_requests
         (confirmation_code, facebook_user_id, facebook_app_id, status, leads_removed, completed_at)
       VALUES ($1,$2,$3,'completed',$4, now())`,
      [codigo, String(dados.user_id), app?.id ?? null, removidos]
    );

    // Formato exigido pela Meta: URL de acompanhamento + código de confirmação.
    res.json({
      url: `${baseUrl()}/api/settings/data-deletion/${codigo}`,
      confirmation_code: codigo,
    });
  } catch (err) {
    console.error('[data-deletion]', err);
    res.status(500).json({ error: 'Não foi possível processar a exclusão agora' });
  }
});

// Instruções legíveis por pessoa, no MESMO endereço do callback.
//
// A Meta oferece dois campos: "Callback de exclusão de dados" (POST com
// signed_request, automático) e "URL de instruções" (uma página). Servindo os
// dois no mesmo endereço, qualquer uma das opções do painel funciona — e quem
// abrir o link no navegador lê o que fazer, em vez de tomar 404.
settingsRouter.get('/data-deletion', (_req, res) => {
  const base = baseUrl();
  res.type('html').send(pagina(
    'Exclusão dos seus dados',
    `Para apagar os dados associados ao seu perfil nesta ferramenta, escolha um dos caminhos:
     <br><br>
     <strong>1. Pelo Facebook (automático)</strong><br>
     Acesse <em>Configurações e privacidade → Configurações → Aplicativos e sites</em>,
     localize este aplicativo e remova-o. O Facebook nos avisa automaticamente e os dados são
     apagados na hora, com um código de confirmação que você pode consultar.
     <br><br>
     <strong>2. Por e-mail</strong><br>
     Escreva para <a href="mailto:${dadosDaEmpresa().email}">${dadosDaEmpresa().email}</a>
     pedindo a exclusão. Respondemos em até 15 dias.
     <br><br>
     São apagados: seu identificador da página (PSID), nome, foto, mensagens trocadas e
     registros de interação. Os comentários públicos que você deixou na página são
     anonimizados. Detalhes na <a href="${base}/privacidade">Política de Privacidade</a>.`
  ));
});

// Página de acompanhamento que a pessoa abre com o código.
settingsRouter.get('/data-deletion/:codigo', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM data_deletion_requests WHERE confirmation_code = $1', [req.params.codigo]
  );
  const pedido = rows[0];

  if (!pedido) {
    return res.status(404).type('html').send(pagina(
      'Código não encontrado',
      'Não encontramos nenhum pedido de exclusão com esse código.'
    ));
  }

  res.type('html').send(pagina(
    'Exclusão de dados concluída',
    `Os dados associados a esta conta foram removidos em ` +
    `${new Date(pedido.completed_at ?? pedido.created_at).toLocaleString('pt-BR')}. ` +
    `Registros removidos: ${pedido.leads_removed}.`,
    pedido.confirmation_code
  ));
});

function pagina(titulo, texto, codigo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: #f6f7f9;
         color: #16181d; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; }
  .caixa { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
           padding: 28px; max-width: 520px; }
  h1 { font-size: 19px; margin: 0 0 10px; }
  p { color: #4b5563; line-height: 1.6; margin: 0; }
  code { background: #f0f1f4; padding: 3px 7px; border-radius: 5px; font-size: 13px; }
</style></head><body><div class="caixa">
<h1>${titulo}</h1><p>${texto}</p>
${codigo ? `<p style="margin-top:14px">Código de confirmação: <code>${codigo}</code></p>` : ''}
</div></body></html>`;
}
