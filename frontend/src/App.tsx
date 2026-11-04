import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { LibraryPage } from './pages/LibraryPage';
import { NewPage } from './pages/NewPage';
import { StudioPage } from './pages/StudioPage';

export const App: React.FC = () => (
  <BrowserRouter>
    <Layout>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/new" element={<NewPage />} />
        <Route path="/upload" element={<Navigate to="/new" replace />} />
        <Route path="/jobs/:jobId" element={<StudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: '#1b1b22',
          color: '#f4f2ee',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          fontSize: '14px',
        },
      }}
    />
  </BrowserRouter>
);

export default App;
