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
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import MemberEmail from './pages/MemberEmail';
import ResumePush from './pages/ResumePush';
import BotOverview from './pages/BotOverview';
import BotQueue from './pages/BotQueue';
import BotLinks from './pages/BotLinks';
import BotHealth from './pages/BotHealth';
import SponsorView from './pages/SponsorView';
import Access from './pages/Access';
import NotFound from './pages/NotFound';

/**
 * /login is public. Everything else is behind ProtectedRoute, which bounces
 * unauthenticated visitors to /login and stashes the intended path so sign-in
 * can send them back.
 *
 * The catch-all matters more here than in the sponsor portal: officers paste
 * each other invoice and sponsor URLs, and a typo used to render a blank page
 * inside the app shell with no way to tell whether the record was missing or
 * the route was.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/sponsors" replace />} />
        <Route path="login" element={<Login />} />

        <Route path="sponsors" element={<ProtectedRoute><Sponsors /></ProtectedRoute>} />
        <Route path="sponsors/:id" element={<ProtectedRoute><SponsorDetail /></ProtectedRoute>} />
        <Route path="sponsors/:id/view" element={<ProtectedRoute><SponsorView /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="invoices/new" element={<ProtectedRoute><InvoiceNew /></ProtectedRoute>} />
        <Route path="invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="unmatched" element={<ProtectedRoute><UnmatchedPayments /></ProtectedRoute>} />
        <Route path="members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
        <Route path="members/:id" element={<ProtectedRoute><MemberDetail /></ProtectedRoute>} />
        <Route path="members/email" element={<ProtectedRoute><MemberEmail /></ProtectedRoute>} />

        {/* The resume push. One email per member with no resume, and a button that cannot be
            undone, so it shows the arithmetic before it offers to run and the results after. */}
        <Route path="resume-push" element={<ProtectedRoute><ResumePush /></ProtectedRoute>} />

        {/* Discord. The bot used to be its own deployment with its own state; these four
            screens are the officer-facing half of absorbing it, and /bot/queue is the one
            that did not exist anywhere before. */}
        <Route path="bot" element={<ProtectedRoute><BotOverview /></ProtectedRoute>} />
        <Route path="bot/queue" element={<ProtectedRoute><BotQueue /></ProtectedRoute>} />
        <Route path="bot/links" element={<ProtectedRoute><BotLinks /></ProtectedRoute>} />
        <Route path="bot/health" element={<ProtectedRoute><BotHealth /></ProtectedRoute>} />

        {/* Who can sign in here, and who can sign in to the Tech League's admin page.
            Kept last because it is the screen that hands out the other screens. */}
        <Route path="access" element={<ProtectedRoute><Access /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
