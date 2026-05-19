import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import LicenseError from './pages/LicenseError';
import Dashboard from './pages/Dashboard';

import Devices from './pages/Devices';
import Tags from './pages/Tags';

import Logs from './pages/Logs';
import Servers from './pages/Servers'; // Added Servers import
import Settings from './pages/Settings';
import Terminal from './pages/Terminal';
import BufferedData from './pages/BufferedData';
import DataStore from './pages/DataStore';

import Layout from './components/Layout';
import Database from './pages/Database';

const PrivateRoute = ({ children }) => {
  const auth = localStorage.getItem('auth');
  return auth ? children : <Navigate to="/login" />;
};

import { ToastProvider, useToast } from './contexts/ToastContext';
import { setupInterceptors } from './services/api';

const AxiosInterceptorSetup = () => {
  const showToast = useToast();
  React.useEffect(() => {
    setupInterceptors(showToast);
  }, [showToast]);
  return null;
};

function App() {
  return (
    <ToastProvider>
      <AxiosInterceptorSetup />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/license-error" element={<LicenseError />} />
          <Route path="/*" element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/devices" element={<Devices />} />
                  <Route path="/tags" element={<Tags />} />

                  <Route path="/servers" element={<Servers />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/terminal" element={<Terminal />} />
                  <Route path="/database" element={<Database />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/buffered-data" element={<BufferedData />} />
                  <Route path="/datastore" element={<DataStore />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          } />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
