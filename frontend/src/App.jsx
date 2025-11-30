import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

import Devices from './pages/Devices';
import Tags from './pages/Tags';

import Logs from './pages/Logs';
import Servers from './pages/Servers'; // Added Servers import
import Settings from './pages/Settings';
import Terminal from './pages/Terminal';
import BufferedData from './pages/BufferedData';

import Layout from './components/Layout';
import Database from './pages/Database';

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
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/database" element={<Database />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/buffered-data" element={<BufferedData />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
