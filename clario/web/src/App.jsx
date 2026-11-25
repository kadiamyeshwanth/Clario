import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { AuthProvider }  from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary     from './components/ErrorBoundary';
import AppLayout         from './components/layout/AppLayout';
import AppBootSkeleton   from './components/ui/AppBootSkeleton';

import PrelandingPage  from './pages/PrelandingPage';
import LoginPage          from './pages/LoginPage';
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
import OAuthCallbackPage  from './pages/OAuthCallbackPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const RecurringPage = lazy(() => import('./pages/RecurringPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const WalletsPage = lazy(() => import('./pages/WalletsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AIInsightsPage = lazy(() => import('./pages/AIInsightsPage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'));
const WrappedPage = lazy(() => import('./pages/WrappedPage'));
const SpendingChallengesPage = lazy(() => import('./pages/SpendingChallengesPage'));
const FamilyPage = lazy(() => import('./pages/FamilyPage'));
import NotFoundPage       from './pages/NotFoundPage';
const SplitsPage = lazy(() => import('./pages/SplitsPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

/* One icon system, filled by default.
   Setting the weight here means no call site has to pass weight="fill", and the
   whole product stays visually consistent. */
const ICON_STYLE = { weight: 'fill', size: 16 };

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<AppBootSkeleton />}>
            <Routes>
              {/* Public */}
              <Route path="/login"          element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback"  element={<OAuthCallbackPage />} />
              <Route path="/404"            element={<NotFoundPage />} />

              {/* Protected */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard"     element={<DashboardPage />} />
                <Route path="/transactions"  element={<TransactionsPage />} />
                <Route path="/recurring"     element={<RecurringPage />} />
                <Route path="/goals"         element={<GoalsPage />} />
                <Route path="/budgets"       element={<BudgetsPage />} />
                <Route path="/analytics"     element={<AnalyticsPage />} />
                <Route path="/subscriptions" element={<SubscriptionsPage />} />
                <Route path="/wallets"       element={<WalletsPage />} />
                <Route path="/ai-insights"   element={<AIInsightsPage />} />
                <Route path="/reports"       element={<ReportsPage />} />
                <Route path="/journal"       element={<JournalPage />} />
                <Route path="/investments"   element={<InvestmentsPage />} />
                <Route path="/wrapped"       element={<WrappedPage />} />
                <Route path="/challenges"    element={<SpendingChallengesPage />} />
                <Route path="/family"        element={<FamilyPage />} />
                <Route path="/splits"        element={<SplitsPage />} />
                <Route path="/splits/:id"    element={<SplitsPage />} />
                <Route path="/settings"      element={<SettingsPage />} />
                <Route path="/help"          element={<HelpPage />} />
              </Route>

              <Route path="/"  element={<PrelandingPage />} />
              <Route path="*"  element={<NotFoundPage />} />
            </Routes>
            </Suspense>
          </BrowserRouter>

          <Toaster position="top-center" containerStyle={{ top: 76 }} gutter={8} toastOptions={{
            style: {
              background: 'rgba(12,12,12,0.62)', color: '#F7F7F7',
              backdropFilter: 'blur(14px) saturate(150%)',
              WebkitBackdropFilter: 'blur(14px) saturate(150%)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px',
              fontSize: '12.5px', fontFamily: "'Inter', sans-serif",
              padding: '7px 13px', boxShadow: '0 8px 26px -10px rgba(0,0,0,0.5)',
            },
            success: { iconTheme: { primary: 'var(--green)', secondary: '#fff' } },
            error:   { iconTheme: { primary: 'var(--red)', secondary: '#fff' } },
            duration: 3500,
          }} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;