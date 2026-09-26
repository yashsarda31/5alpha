const parseBody = async (response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

const request = async (url, method, body, config = {}) => {
  const headers = { ...(config.headers || {}) };
  let payload;

  if (body !== undefined && body !== null) {
    const isNativeBody = typeof FormData !== 'undefined' && body instanceof FormData;
    if (isNativeBody) {
      payload = body;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      payload = JSON.stringify(body);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
    signal: config.signal,
    credentials: config.credentials,
  });
  const data = await parseBody(response);

  if (!response.ok) {
    const error = new Error(data?.detail || `Request failed with status ${response.status}`);
    error.response = { status: response.status, data, headers: response.headers };
    throw error;
  }

  return { data, status: response.status, headers: response.headers };
};

export const apiClient = {
  get: (url, config) => request(url, 'GET', undefined, config),
  post: (url, body, config) => request(url, 'POST', body, config),
  delete: (url, config) => request(url, 'DELETE', undefined, config),
};
