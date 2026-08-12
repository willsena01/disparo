import { get, post, patch, del, qs } from './client.js';

// Páginas e grupos
export const pagesApi = {
  list: () => get('/api/pages'),
  scan: () => post('/api/pages/scan'),
  subscribe: (id) => post(`/api/pages/${id}/subscribe`),
  unlink: (id) => del(`/api/pages/${id}`),
  setGroup: (id, groupId) => patch(`/api/pages/${id}/group`, { groupId }),
  oauthConfig: () => get('/api/pages/oauth/config'),
  // O início do OAuth é navegação do browser (redireciona pro Facebook), não
  // fetch — por isso devolve a URL em vez de chamar.
  oauthStartUrl: (appId) => `/api/pages/oauth/start?appId=${encodeURIComponent(appId)}`,
};

export const pageGroupsApi = {
  list: () => get('/api/page-groups'),
  create: (name) => post('/api/page-groups', { name }),
  rename: (id, name) => patch(`/api/page-groups/${id}`, { name }),
  remove: (id) => del(`/api/page-groups/${id}`),
};

export const appsApi = {
  list: () => get('/api/facebook-apps'),
  create: (body) => post('/api/facebook-apps', body),
  update: (id, body) => patch(`/api/facebook-apps/${id}`, body),
  remove: (id) => del(`/api/facebook-apps/${id}`),
};

// URLs e valores pra colar no painel do Meta.
export const settingsApi = {
  urls: () => get('/api/settings/urls'),
};

// Leads
export const leadsApi = {
  list: (filtros) => get(`/api/leads${qs(filtros)}`),
  tags: () => get('/api/leads/tags'),
  update: (id, body) => patch(`/api/leads/${id}`, body),
  addTag: (id, name) => post(`/api/leads/${id}/tags`, { name }),
  removeTag: (id, name) => del(`/api/leads/${id}/tags/${encodeURIComponent(name)}`),
};

// Broadcasts
export const broadcastsApi = {
  list: (status) => get(`/api/broadcasts${qs({ status })}`),
  create: (body) => post('/api/broadcasts', body),
  preview: (targetFilter) => post('/api/broadcasts/preview', { targetFilter }),
  progress: (id) => get(`/api/broadcasts/${id}/progress`),
  start: (id) => post(`/api/broadcasts/${id}/start`),
  pause: (id) => post(`/api/broadcasts/${id}/pause`),
  resume: (id) => post(`/api/broadcasts/${id}/resume`),
  remove: (id) => del(`/api/broadcasts/${id}`),
};

// Fluxos
export const flowsApi = {
  list: () => get('/api/flows'),
  get: (id) => get(`/api/flows/${id}`),
  create: (body) => post('/api/flows', body),
  update: (id, body) => patch(`/api/flows/${id}`, body),
  remove: (id) => del(`/api/flows/${id}`),
  addTrigger: (id, body) => post(`/api/flows/${id}/triggers`, body),
  removeTrigger: (id, triggerId) => del(`/api/flows/${id}/triggers/${triggerId}`),
  // Aceita { pageId } (teste pela página, com lead fictício) ou { leadId }.
  test: (id, alvo) => post(`/api/flows/${id}/test`, alvo),
  // Catálogo de {{variáveis}} de personalização.
  variaveis: () => get('/api/flows/variaveis'),
};

// Comentários: regras de auto-resposta + histórico do que foi capturado
export const commentsApi = {
  listRules: (pageId) => get(`/api/comments/rules${qs({ pageId })}`),
  createRule: (body) => post('/api/comments/rules', body),
  updateRule: (id, body) => patch(`/api/comments/rules/${id}`, body),
  removeRule: (id) => del(`/api/comments/rules/${id}`),
  list: (filtros) => get(`/api/comments${qs(filtros)}`),
};

// Templates
export const templatesApi = {
  list: (pageId) => get(`/api/templates${qs({ pageId })}`),
  messageTags: () => get('/api/templates/message-tags'),
  create: (body) => post('/api/templates', body),
  sync: () => post('/api/templates/sync'),
  remove: (id) => del(`/api/templates/${id}`),
};
