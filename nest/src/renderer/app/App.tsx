import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@renderer/components/Layout';
import { Dashboard } from '@renderer/features/dashboard/Dashboard';
import { Projects } from '@renderer/features/projects/Projects';
import { ProjectDetails } from '@renderer/features/projects/ProjectDetails';
import { Network } from '@renderer/features/network/Network';
import { Logs } from '@renderer/features/logs/Logs';
import { Settings } from '@renderer/features/settings/Settings';
import { Diagnostics } from '@renderer/features/diagnostics/Diagnostics';
import { Audit } from '@renderer/features/audit/Audit';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:appId" element={<ProjectDetails />} />
            <Route path="/network" element={<Network />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/audit" element={<Audit />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
