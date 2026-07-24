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

// Multipart upload with progress. fetch can't report upload progress, so this
// uses XHR — onProgress(fraction 0..1) fires as bytes go up (useful for large
// video). Resolves with the parsed JSON, rejects with an Error carrying .data.
export function uploadFileWithProgress(path, file, { fields = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.set('file', file);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrfToken());
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else { const err = new Error(data?.error || xhr.statusText || 'Upload failed'); err.status = xhr.status; err.data = data; reject(err); }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(fd);
  });
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

  // Session expired? Refresh once and retry the original request. Only the
  // refresh/login calls themselves are excluded (to avoid recursion / not to
  // mask real credential failures) — crucially, /auth/me MUST be retried so a
  // page reload after the 15-min access token expires silently re-auths from the
  // long-lived refresh token instead of logging the admin out.
  const skipRefresh = path.startsWith('/auth/refresh') || path.startsWith('/auth/login');
  if (res.status === 401 && !_retry && !skipRefresh) {
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
