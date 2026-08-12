// Ponto de entrada da Vercel: a mesma aplicação Express, exportada como função
// serverless em vez de escutar numa porta.
//
// src/server.js só chama app.listen() quando executado direto (`npm run
// server`), então importar aqui não sobe servidor nenhum.
export { default } from '../src/server.js';
