import { useEffect, useState } from 'react';

// Cada card busca seu próprio dado, independente dos outros — se uma query
// falhar (ex: banco fora do ar), o resto do dashboard continua funcionando
// em vez de derrubar a tela inteira.
export function useAsync(fetchFn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: null });

    fetchFn()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (alive) setState({ data: null, loading: false, error });
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
