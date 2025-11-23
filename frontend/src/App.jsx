import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

import Devices from './pages/Devices';
import Tags from './pages/Tags';

import Logs from './pages/Logs';
import Servers from './pages/Servers'; // Added Servers import

// Placeholder pages
const Settings = () => <div className="text-white">Settings Page (Coming Soon)</div>;

import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/tags" element={<Tags />} />

          <Route path="/servers" element={<Servers />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
