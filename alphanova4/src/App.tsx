import { Navigate, useRoutes } from 'react-router-dom';
import { CORE_ROUTES } from './coreRoutes';

const RouteStub = ({ label }: { label: string }) => (
  <main data-route-label={label} aria-label={`${label} workspace`} />
);

export default function App() {
  return useRoutes([
    ...CORE_ROUTES.map(({ path, label }) => ({ path, element: <RouteStub label={label} /> })),
    { path: '/login', element: <RouteStub label="Account" /> },
    { path: '*', element: <Navigate to="/dashboard" replace /> },
  ]);
}
