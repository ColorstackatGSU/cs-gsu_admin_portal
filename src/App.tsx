import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ProtectedRoute } from './auth/ProtectedRoute';
import Login from './pages/Login';
import Sponsors from './pages/Sponsors';
import SponsorDetail from './pages/SponsorDetail';
import Invoices from './pages/Invoices';
import InvoiceNew from './pages/InvoiceNew';
import InvoiceDetail from './pages/InvoiceDetail';
import UnmatchedPayments from './pages/UnmatchedPayments';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/sponsors" replace />} />
        <Route path="login" element={<Login />} />

        <Route path="sponsors" element={<ProtectedRoute><Sponsors /></ProtectedRoute>} />
        <Route path="sponsors/:id" element={<ProtectedRoute><SponsorDetail /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="invoices/new" element={<ProtectedRoute><InvoiceNew /></ProtectedRoute>} />
        <Route path="invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="unmatched" element={<ProtectedRoute><UnmatchedPayments /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
