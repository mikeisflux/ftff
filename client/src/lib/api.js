// Tiny fetch wrapper. Cookies are httpOnly and sent automatically with
// credentials:'include'. CSRF token is read from the non-httpOnly csrf cookie
// and echoed in the X-CSRF-Token header for state-changing requests (§4.3).

const BASE = '/api/v1';

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Multipart upload (images). Sends the CSRF header; lets the browser set the
// multipart Content-Type/boundary.
export async function uploadFile(path, file, fields = {}) {
  const fd = new FormData();
  fd.set('file', file);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken() },
    body: fd,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(data?.error || res.statusText); e.data = data; throw e; }
  return data;
}

// Refresh the access token at most once at a time when a request 401s, so an
// expired short-lived session is renewed transparently instead of silently
// failing admin actions.
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken() },
    }).then((r) => r.ok).catch(() => false).finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, headers = {}, _retry = false } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD'].includes(method)) {
    opts.headers['X-CSRF-Token'] = csrfToken();
  }
  let res = await fetch(`${BASE}${path}`, opts);

  // Session expired? Refresh once and retry the original request.
  if (res.status === 401 && !_retry && !path.startsWith('/auth/')) {
    const ok = await refreshSession();
    if (ok) {
      if (!['GET', 'HEAD'].includes(method)) opts.headers['X-CSRF-Token'] = csrfToken();
      res = await fetch(`${BASE}${path}`, opts);
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
