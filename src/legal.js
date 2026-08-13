import { baseUrl, SCOPES } from './facebookOAuth.js';

// Política de Privacidade e Termos de Serviço.
//
// A Meta exige que as duas URLs existam e abram para aprovar o app, e que a
// política descreva os dados tratados. O texto aqui NÃO é genérico: descreve
// exatamente o que este sistema coleta e faz — PSID, nome e foto de quem
// comenta, texto do comentário, status de entrega e leitura, cliques em link.
// Descrever a mais ou a menos é o que reprova na revisão.
//
// A identidade do responsável precisa ser a MESMA empresa verificada no
// portfólio empresarial da Meta — a análise do app cruza os dois, e divergência
// reprova por inconsistência. Aqui está a que consta como verificada:
// 58.338.495 VICTOR DOS SANTOS DIAS, verificada em 17/05/2026.
//
// Continua sobrescrevível por ambiente para quem rodar a ferramenta sob outra
// razão social — é o único dado aqui que não dá pra deduzir do código.
export function dadosDaEmpresa() {
  return {
    nome: process.env.EMPRESA_NOME ?? '58.338.495 VICTOR DOS SANTOS DIAS',
    documento: process.env.EMPRESA_DOC ?? 'CNPJ 58.338.495/0001-43',
    email: process.env.EMPRESA_EMAIL ?? '2004meloliveira@gmail.com',
    endereco: process.env.EMPRESA_ENDERECO
      ?? 'Av. Oliveira 9A, Salvador/BA, CEP 41.225-850',
    atualizadoEm: process.env.LEGAL_ATUALIZADO_EM ?? '12 de agosto de 2026',
  };
}

export function identificacaoCompleta() {
  const e = dadosDaEmpresa();
  return Boolean(e.nome && e.email);
}

// Campo não preenchido aparece marcado, não em branco: uma política publicada
// com o controlador vazio é pior do que uma que denuncia o que falta.
function campo(valor, oQue) {
  return valor ?? `<mark>[configure ${oQue} em ${'`'}.env${'`'}]</mark>`;
}

function pagina(titulo, corpo) {
  const e = dadosDaEmpresa();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system,'Segoe UI',Arial,sans-serif; background:#f6f7f9; color:#16181d;
         margin:0; padding:32px 20px; line-height:1.65; }
  main { max-width: 760px; margin: 0 auto; background:#fff; border:1px solid #e5e7eb;
         border-radius:12px; padding:36px 40px; }
  h1 { font-size:24px; margin:0 0 6px; }
  h2 { font-size:16px; margin:28px 0 8px; }
  p, li { color:#374151; font-size:14.5px; }
  ul { padding-left:20px; }
  .meta { color:#6b7280; font-size:13px; margin-bottom:8px; }
  mark { background:#fef3c7; color:#92400e; padding:1px 5px; border-radius:4px; font-size:13px; }
  a { color:#4f46e5; }
  footer { margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:13px; }
  @media (max-width:640px) { main { padding:24px 20px; } }
</style></head><body><main>
<h1>${titulo}</h1>
<p class="meta">Atualizado em ${e.atualizadoEm}</p>
${corpo}
<footer>
  <p>Responsável pelo tratamento: ${campo(e.nome, 'EMPRESA_NOME')}${e.documento ? ` — ${e.documento}` : ''}.</p>
  <p>Contato: ${campo(e.email, 'EMPRESA_EMAIL')}${e.endereco ? ` · ${e.endereco}` : ''}</p>
</footer>
</main></body></html>`;
}

export function paginaDePrivacidade() {
  const e = dadosDaEmpresa();
  const base = baseUrl();

  return pagina('Política de Privacidade', `
<p>
  Esta política descreve como ${campo(e.nome, 'EMPRESA_NOME')} (“nós”) trata dados pessoais na
  ferramenta de automação de atendimento pelo Facebook Messenger, integrada às plataformas da Meta.
</p>

<h2>1. Quais dados tratamos</h2>
<p>Quando alguém comenta em um post de uma página do Facebook conectada à ferramenta, recebemos e armazenamos:</p>
<ul>
  <li><strong>Identificador da pessoa na página (PSID)</strong> — um código fornecido pela Meta,
      exclusivo por página. Não é o perfil do Facebook e não permite identificar a pessoa fora daquela página.</li>
  <li><strong>Nome público e foto do perfil</strong>, quando a Meta os fornece.</li>
  <li><strong>Texto do comentário</strong> e o identificador do post em que ele foi feito.</li>
  <li><strong>Mensagens trocadas</strong> pelo Messenger a partir dessa interação, com data, status de
      entrega e de leitura informados pela Meta.</li>
  <li><strong>Cliques</strong> nos links enviados nas mensagens, quando o link é encurtado pela ferramenta.</li>
  <li><strong>Etiquetas (tags)</strong> que registram por quais etapas do atendimento a pessoa passou.</li>
</ul>
<p>
  Também armazenamos credenciais de acesso das páginas conectadas (tokens fornecidos pela Meta), que
  identificam a página — não pessoas.
</p>
<p>Não coletamos dados sensíveis, dados de pagamento das pessoas atendidas, nem localização.</p>

<h2>2. Para que usamos</h2>
<ul>
  <li>Responder automaticamente a quem comenta, no próprio comentário e por mensagem privada.</li>
  <li>Conduzir a conversa pelo fluxo de atendimento configurado pela página.</li>
  <li>Enviar comunicações posteriores a quem interagiu, respeitando as regras da Meta.</li>
  <li>Gerar relatórios agregados de desempenho (quantas mensagens saíram, foram entregues, lidas e clicadas).</li>
</ul>
<p>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>

<h2>3. Base legal</h2>
<p>
  Tratamos os dados com base no legítimo interesse de responder a quem procurou a página
  espontaneamente (art. 7º, IX, da LGPD) e na execução de diligências a pedido do titular
  (art. 7º, V). A pessoa pode se opor a qualquer momento, conforme a seção 6.
</p>

<h2>4. Compartilhamento</h2>
<ul>
  <li><strong>Meta Platforms</strong> — as mensagens trafegam pela infraestrutura do Facebook
      Messenger e estão sujeitas às políticas da Meta.</li>
  <li><strong>Provedor de hospedagem</strong> desta ferramenta, que armazena os dados em nosso nome.</li>
  <li><strong>Autoridades</strong>, quando houver obrigação legal.</li>
</ul>

<h2>5. Por quanto tempo guardamos</h2>
<p>
  Mantemos os dados enquanto a página estiver conectada e a pessoa não solicitar exclusão. Removida a
  conexão da página ou solicitada a exclusão, os dados pessoais são apagados; permanecem apenas
  contagens agregadas, que não identificam ninguém.
</p>

<h2>6. Direitos da pessoa e como excluir os dados</h2>
<p>A qualquer momento é possível pedir confirmação, acesso, correção, portabilidade ou exclusão dos dados.</p>
<ul>
  <li><strong>Pelo Facebook:</strong> remover a permissão do aplicativo em
      Configurações → Aplicativos e sites. A Meta nos avisa automaticamente e os dados são apagados,
      com código de confirmação disponível para consulta.</li>
  <li><strong>Por e-mail:</strong> escreva para ${campo(e.email, 'EMPRESA_EMAIL')}. Respondemos em até 15 dias.</li>
</ul>
<p>Endereço técnico do processo automático de exclusão: <a href="${base}/api/data-deletion">${base}/api/data-deletion</a></p>

<h2>7. Segurança</h2>
<p>
  O acesso ao painel é restrito. As comunicações com a Meta usam HTTPS e cada requisição recebida do
  Facebook tem sua assinatura verificada antes de ser processada, o que impede que terceiros
  injetem eventos falsos.
</p>

<h2>8. Permissões que o aplicativo solicita à Meta</h2>
<ul>${SCOPES.map((s) => `<li><code>${s}</code></li>`).join('')}</ul>
<p>São as permissões mínimas para listar as páginas, ler comentários, responder e enviar mensagens.</p>

<h2>9. Alterações</h2>
<p>Alterações relevantes serão publicadas nesta mesma página, com a data de atualização acima.</p>
`);
}

export function paginaDeTermos() {
  const e = dadosDaEmpresa();

  return pagina('Termos de Serviço', `
<p>
  Estes termos regem o uso da ferramenta de automação de atendimento pelo Facebook Messenger
  oferecida por ${campo(e.nome, 'EMPRESA_NOME')}. Ao usar o serviço, você concorda com eles.
</p>

<h2>1. O que o serviço faz</h2>
<p>
  A ferramenta conecta páginas do Facebook, identifica comentários em posts, responde
  automaticamente no comentário e por mensagem privada, conduz fluxos de atendimento e envia
  comunicações às pessoas que já interagiram.
</p>

<h2>2. Sua conta e suas páginas</h2>
<ul>
  <li>Você declara ter autorização para administrar as páginas conectadas.</li>
  <li>Você é responsável pelo conteúdo das mensagens configuradas e pelas listas de contatos.</li>
  <li>As credenciais de acesso são pessoais; o uso indevido é de sua responsabilidade.</li>
</ul>

<h2>3. Regras de uso</h2>
<p>É proibido usar o serviço para:</p>
<ul>
  <li>enviar mensagens não solicitadas fora do que as políticas da Meta permitem;</li>
  <li>conteúdo ilegal, enganoso, discriminatório ou que viole direitos de terceiros;</li>
  <li>burlar limites, bloqueios ou mecanismos de segurança da Meta;</li>
  <li>coletar dados de pessoas para finalidade diferente da informada a elas.</li>
</ul>
<p>
  O uso do Messenger está sujeito às <strong>Políticas da Plataforma da Meta</strong>, inclusive à
  regra de que mensagens livres só são permitidas dentro de 24 horas da última interação da pessoa.
  Violações podem levar a Meta a restringir ou bloquear seu aplicativo ou sua página — consequência
  aplicada pela Meta, fora do nosso controle.
</p>

<h2>4. Disponibilidade</h2>
<p>
  O serviço depende das APIs da Meta. Interrupções, mudanças de política ou restrições impostas por
  ela podem afetar o funcionamento. Fazemos manutenções programadas sempre que possível com aviso.
</p>

<h2>5. Limitação de responsabilidade</h2>
<p>
  O serviço é fornecido no estado em que se encontra. Não garantimos resultado comercial, taxa de
  entrega ou aprovação de aplicativos pela Meta. Nossa responsabilidade, quando cabível, limita-se
  ao valor pago pelo serviço nos 12 meses anteriores ao evento.
</p>

<h2>6. Encerramento</h2>
<p>
  Você pode encerrar o uso a qualquer momento, desconectando as páginas. Podemos suspender contas
  que violem estes termos ou as políticas da Meta. Encerrado o uso, os dados são tratados conforme a
  <a href="${baseUrl()}/privacidade">Política de Privacidade</a>.
</p>

<h2>7. Lei aplicável</h2>
<p>
  Aplica-se a legislação brasileira, inclusive a Lei Geral de Proteção de Dados (Lei 13.709/2018),
  com foro no domicílio do consumidor quando aplicável.
</p>
`);
}
