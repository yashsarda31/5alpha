// Local-only fixtures: exercise the real hooks with controlled network timing.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../src/legacy/AuthContext';
import { useResource } from '../src/lib/useResource';

function ResourceProbe() {
  const [url, setUrl] = useState<string | null>('/api/quality/first');
  const resource = useResource(url, 30_000);
  Object.assign(window, { quality: { ...resource, setUrl } });
  return <pre>{JSON.stringify(resource)}</pre>;
}
function AuthProbe() {
  const auth = useAuth();
  Object.assign(window, { quality: auth });
  return <pre>{JSON.stringify({ user: auth.currentUser, loading: auth.loading })}</pre>;
}
createRoot(document.getElementById('root')!).render(
  location.search.includes('auth') ? <AuthProvider><AuthProbe /></AuthProvider> : <ResourceProbe />,
);
