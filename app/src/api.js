const json = async (path, options = {}) => {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === 'string'
      ? body.detail
      : (body.detail?.[0]?.msg ?? res.statusText);
    throw new Error(detail);
  }
  return res.json();
};

export const api = {
  get: (path) => json(path),
  post: (path, body) => json(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => json(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => json(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => json(path, { method: 'DELETE' }),
};

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export const money = (value) => inr.format(Number(value ?? 0));

export const day = (value) =>
  new Date(String(value).replace(' ', 'T')).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short',
  });

export const timeOf = (value) =>
  new Date(String(value).replace(' ', 'T')).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
