import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// API_PORT permite apontar o front pra outra instância da API sem editar este
// arquivo (útil quando há mais de um backend rodando na máquina). Definível
// pelo ambiente ou por web/.env.local.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.API_PORT || 3000;

  return {
    plugins: [react()],
    server: {
      // 5173 continua sendo o padrão; PORT permite subir uma segunda instância
      // sem colidir com a que já estiver rodando.
      port: Number(env.PORT) || 5173,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        // Redirecionador de link rastreado (fica fora de /api). A chave é
        // regex de propósito: como string, o vite casa por prefixo e '/r'
        // engoliria '/relatorios'. Aqui só casa /r/<token>, um segmento só.
        '^/r/[A-Za-z0-9_-]+$': `http://localhost:${apiPort}`,
      },
    },
  };
});
