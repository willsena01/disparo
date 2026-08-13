// Tradução dos erros da Graph API.
//
// A Meta devolve textos que descrevem o sintoma, não a causa. O caso que mais
// custa tempo é este:
//
//   "Object with ID '123_456' does not exist, cannot be loaded due to missing
//    permissions, or does not support this operation" (code 100, subcode 33)
//
// Três causas diferentes na mesma frase, e a real quase sempre é a terceira:
// o app está em Acesso Padrão, então só alcança quem tem papel nele. Quem lê
// isso sem contexto vai procurar bug no próprio código — foi o que aconteceu.
//
// Aqui a mensagem crua é preservada (ela tem o fbtrace_id, útil no suporte da
// Meta) e ganha uma explicação na frente.

const REGRAS = [
  {
    // O sintoma clássico de Acesso Padrão tentando falar com público geral.
    quando: (m) => /does not exist, cannot be loaded due to missing permissions/i.test(m)
      || /\(#200\) Missing Permissions/i.test(m),
    explicacao:
      'A Meta bloqueou o envio porque o app está em Acesso Padrão, que só alcança quem tem '
      + 'papel no app (administrador, desenvolvedor ou testador). Para atingir qualquer pessoa, '
      + 'peça Acesso Avançado para pages_messaging e pages_read_engagement na Análise do App.',
  },
  {
    quando: (m) => /outside of allowed window/i.test(m) || /\(#10\)/.test(m),
    explicacao:
      'Passaram-se mais de 24 horas desde a última interação da pessoa. Fora dessa janela a Meta '
      + 'só aceita mensagem com MESSAGE_TAG, e nenhuma tag cobre conteúdo promocional.',
  },
  {
    quando: (m) => /user (has )?blocked|cannot message this user|not available/i.test(m),
    explicacao: 'Esta pessoa bloqueou a página ou desativou a conta — não há o que corrigir aqui.',
  },
  {
    quando: (m) => /Invalid OAuth access token|Session has expired|code 190/i.test(m),
    explicacao:
      'O token da página não vale mais. Reconecte a página em Páginas → Conectar com Facebook.',
  },
  {
    quando: (m) => /rate limit|too many calls|request limit reached/i.test(m),
    explicacao: 'Limite de chamadas da Meta atingido. O envio volta sozinho quando a janela reabre.',
  },
];

// Devolve a mensagem original acrescida da explicação, quando houver uma.
// Sem regra que case, devolve intacta: inventar diagnóstico é pior que não ter.
export function explicarErroDaMeta(mensagem) {
  const texto = String(mensagem ?? '').trim();
  if (!texto) return texto;

  const regra = REGRAS.find((r) => r.quando(texto));
  return regra ? `${regra.explicacao}\n\nResposta da Meta: ${texto}` : texto;
}
