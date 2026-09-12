/**
 * Cloudflare Worker OAuth proxy for the notes app.
 *
 * Required bindings/variables:
 *   OAUTH_SESSIONS_KV (KV), GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
 *   GITHUB_REPO_OWNER, GITHUB_REPO_NAME
 */
const COOKIE = 'notes_session';
const CALLBACK = '/auth/callback';
const SESSION_COOKIE = COOKIE + '=SESSION; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=2592000';
const CLEAR_COOKIE = COOKIE + '=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0';

const corsHeaders = (request) => {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
};
const response = (request, body, status = 200, extra = {}) =>
  new Response(body, { status, headers: Object.assign(corsHeaders(request), extra) });
const json = (request, value, status = 200) =>
  response(request, JSON.stringify(value), status, { 'Content-Type': 'application/json' });
const random = (bytes = 32) => {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (n) => n.toString(16).padStart(2, '0')).join('');
};
const cookieValue = (request) => {
  const match = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;)\\s*' + COOKIE + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : '';
};
const githubPath = (env, path) =>
  'https://api.github.com/repos/' + encodeURIComponent(env.GITHUB_REPO_OWNER) + '/' +
  encodeURIComponent(env.GITHUB_REPO_NAME) + '/contents/' + path;

async function github(request, env, path, options) {
  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'so-tay-kien-thuc-worker',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: 'Bearer ' + request.githubToken
  };
  const requestOptions = Object.assign({}, options || {});
  requestOptions.headers = Object.assign(baseHeaders, requestOptions.headers || {});
  return fetch(githubPath(env, path), requestOptions);
}
async function requireSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  const id = bearer || cookieValue(request);
  if (!id) return null;
  const token = await env.OAUTH_SESSIONS_KV.get('session:' + id);
  return token ? { id, token } : null;
}
async function proxy(request, env, session, path) {
  request.githubToken = session.token;
  let options = {};
  if (request.method === 'PUT') {
    const value = await request.text();
    let existing = await github(request, env, path);
    let sha = null;
    if (existing.ok) sha = (await existing.json()).sha;
    const payload = { message: 'Update notes', content: btoa(unescape(encodeURIComponent(value))) };
    if (sha) payload.sha = sha;
    options = { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) };
  } else if (request.method === 'DELETE') {
    const existing = await github(request, env, path);
    if (!existing.ok) return response(request, 'OK');
    options = { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Delete note', sha: (await existing.json()).sha }) };
  }
  const gh = await github(request, env, path, options);
  const text = await gh.text();
  if (!gh.ok) return response(request, text || gh.statusText, gh.status, { 'Content-Type': 'application/json' });
  if (request.method === 'GET') {
    const data = JSON.parse(text);
    if (!data.content) return response(request, 'Không tìm thấy.', 404);
    const decoded = Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    return response(request, new TextDecoder().decode(decoded), 200, { 'Content-Type': 'application/json' });
  }
  const data = JSON.parse(text);
  return json(request, { sha: data.content && data.content.sha });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return response(request, null, 204);
    if (url.pathname === '/auth/login') {
      const state = random();
      const requestedReturnTo = url.searchParams.get('return_to') || '';
      let returnTo = url.origin + '/';
      try {
        const candidate = new URL(requestedReturnTo);
        if (candidate.protocol === 'http:' || candidate.protocol === 'https:') returnTo = candidate.toString();
      } catch (e) {}
      await env.OAUTH_SESSIONS_KV.put('state:' + state, returnTo, { expirationTtl: 600 });
      const githubUrl = new URL('https://github.com/login/oauth/authorize');
      githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      githubUrl.searchParams.set('redirect_uri', url.origin + CALLBACK);
      githubUrl.searchParams.set('scope', 'repo');
      githubUrl.searchParams.set('state', state);
      return Response.redirect(githubUrl.toString(), 302);
    }
    if (url.pathname === CALLBACK) {
      const state = url.searchParams.get('state');
      const returnTo = state && await env.OAUTH_SESSIONS_KV.get('state:' + state);
      if (!returnTo || !url.searchParams.get('code')) return response(request, 'OAuth state không hợp lệ.', 400);
      await env.OAUTH_SESSIONS_KV.delete('state:' + state);
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get('code'), redirect_uri: url.origin + CALLBACK })
      });
      const token = await tokenRes.json();
      if (!token.access_token) return response(request, 'Không lấy được GitHub access token.', 502);
      const session = random();
      await env.OAUTH_SESSIONS_KV.put('session:' + session, token.access_token, { expirationTtl: 2592000 });
      const authCode = random();
      await env.OAUTH_SESSIONS_KV.put('exchange:' + authCode, session, { expirationTtl: 120 });
      const redirect = new URL(returnTo);
      redirect.searchParams.set('oauth_code', authCode);
      return new Response(null, { status: 302, headers: Object.assign(corsHeaders(request), {
        Location: redirect.toString(), 'Set-Cookie': SESSION_COOKIE.replace('SESSION', encodeURIComponent(session))
      })});
    }
    if (url.pathname === '/auth/exchange' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const code = typeof body.code === 'string' ? body.code : '';
      if (!code) return json(request, { error: 'missing_code' }, 400);
      const session = await env.OAUTH_SESSIONS_KV.get('exchange:' + code);
      if (!session) return json(request, { error: 'invalid_or_expired_code' }, 401);
      await env.OAUTH_SESSIONS_KV.delete('exchange:' + code);
      return json(request, { session });
    }
    if (url.pathname === '/auth/me') {
      const session = await requireSession(request, env);
      if (!session) return json(request, { authenticated: false }, 401);
      request.githubToken = session.token;
      const gh = await fetch('https://api.github.com/user', { headers: {
        Accept: 'application/vnd.github+json', 'User-Agent': 'so-tay-kien-thuc-worker',
        Authorization: 'Bearer ' + request.githubToken,
        'X-GitHub-Api-Version': '2022-11-28'
      }});
      const user = gh.ok ? await gh.json() : {};
      return json(request, { authenticated: true, login: user.login || null });
    }
    if (url.pathname === '/auth/logout') {
      const auth = request.headers.get('Authorization') || '';
      const bearer = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
      const id = bearer || cookieValue(request);
      if (id) await env.OAUTH_SESSIONS_KV.delete('session:' + id);
      return new Response(null, { status: 204, headers: Object.assign(corsHeaders(request), {
        'Set-Cookie': CLEAR_COOKIE
      })});
    }
    const match = url.pathname.match(/^\/(index|last|notes\/[A-Za-z0-9_-]+)$/);
    if (!match || !['GET', 'PUT', 'DELETE'].includes(request.method))
      return response(request, 'Không tìm thấy.', 404);
    const session = await requireSession(request, env);
    if (!session) return json(request, { error: 'authentication_required' }, 401);
    try { return await proxy(request, env, session, match[1] + (match[1] === 'index' || match[1] === 'last' ? '.json' : '.json')); }
    catch (e) { return response(request, 'Lỗi máy chủ: ' + e.message, 500); }
  }
};
