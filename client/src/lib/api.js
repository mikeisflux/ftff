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

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
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
  const res = await fetch(`${BASE}${path}`, opts);
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
