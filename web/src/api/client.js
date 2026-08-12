// Cliente HTTP das telas.
//
// O erro carrega a mensagem que a API mandou no corpo (`{ error }`), não um
// "Erro 400" genérico: as validações do backend explicam o que está errado, e
// engolir isso obriga o operador a adivinhar.
async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const err = new Error(payload.error || `Erro ${res.status} em ${path}`);
    err.status = res.status;
    throw err;
  }

  // 204 (delete) não tem corpo — .json() explodiria.
  if (res.status === 204) return null;
  return res.json();
}

export const get = (path) => request('GET', path);
export const post = (path, body) => request('POST', path, body);
export const patch = (path, body) => request('PATCH', path, body);
export const del = (path) => request('DELETE', path);

// Monta query string ignorando filtro vazio — `?source=` casaria com nada em
// vez de significar "sem filtro".
export function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
