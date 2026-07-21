// Worker principal do sistema de login/listas.
// Reaproveita as mesmas funções que antes viviam em functions/api/*.js
// (formato "onRequestGet" / "onRequestPost" do Cloudflare Pages Functions).

import * as adminApproveReset from '../functions/api/admin-approve-reset.js';
import * as adminAssign from '../functions/api/admin-assign.js';
import * as adminCancelReset from '../functions/api/admin-cancel-reset.js';
import * as adminList from '../functions/api/admin-list.js';
import * as adminSetActive from '../functions/api/admin-set-active.js';
import * as adminSetRole from '../functions/api/admin-set-role.js';
import * as adminUpdate from '../functions/api/admin-update.js';
import * as confirm from '../functions/api/confirm.js';
import * as login from '../functions/api/login.js';
import * as listaList from '../functions/api/lista-list.js';
import * as listaLoad from '../functions/api/lista-load.js';
import * as listaSave from '../functions/api/lista-save.js';
import * as onedriveList from '../functions/api/onedrive-list.js';
import * as onedriveLoad from '../functions/api/onedrive-load.js';
import * as onedriveSave from '../functions/api/onedrive-save.js';
import * as requestPasswordReset from '../functions/api/request-password-reset.js';
import * as resetPassword from '../functions/api/reset-password.js';
import * as signup from '../functions/api/signup.js';
import * as verifySession from '../functions/api/verify-session.js';

// Mapa "MÉTODO caminho" -> handler original.
const routes = {
  'POST /api/admin-approve-reset': adminApproveReset.onRequestPost,
  'POST /api/admin-assign': adminAssign.onRequestPost,
  'POST /api/admin-cancel-reset': adminCancelReset.onRequestPost,
  'GET /api/admin-list': adminList.onRequestGet,
  'POST /api/admin-set-active': adminSetActive.onRequestPost,
  'POST /api/admin-set-role': adminSetRole.onRequestPost,
  'POST /api/admin-update': adminUpdate.onRequestPost,
  'POST /api/confirm': confirm.onRequestPost,
  'POST /api/login': login.onRequestPost,
  'POST /api/lista-list': listaList.onRequestPost,
  'POST /api/lista-load': listaLoad.onRequestPost,
  'POST /api/lista-save': listaSave.onRequestPost,
  'POST /api/onedrive-list': onedriveList.onRequestPost,
  'POST /api/onedrive-load': onedriveLoad.onRequestPost,
  'POST /api/onedrive-save': onedriveSave.onRequestPost,
  'POST /api/request-password-reset': requestPasswordReset.onRequestPost,
  'POST /api/reset-password': resetPassword.onRequestPost,
  'POST /api/signup': signup.onRequestPost,
  'POST /api/verify-session': verifySession.onRequestPost,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const routeKey = `${request.method} ${url.pathname}`;
    const handler = routes[routeKey];

    if (handler) {
      try {
        // O mesmo formato de "context" que as funções já esperavam.
        return await handler({ request, env, ctx, params: {}, data: {} });
      } catch (err) {
        console.error('Erro na rota', routeKey, err);
        return new Response(
          JSON.stringify({ error: 'Erro interno do servidor' }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // Qualquer outra chamada a /api/* que não bateu com nenhuma rota conhecida.
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Rota não encontrada' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    // Tudo o que não é /api/* é arquivo estático (html, css, js, etc).
    // Normalmente isso nem chega a rodar essa linha, pois os assets
    // são servidos automaticamente antes do Worker — isso aqui é
    // só um fallback de segurança.
    return env.ASSETS.fetch(request);
  },
};
