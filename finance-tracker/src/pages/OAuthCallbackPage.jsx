/**
 * OAuthCallbackPage — Handles the redirect from /api/auth/google/callback.
 *
 * The backend redirects to: /auth/callback?token=JWT_HERE
 * This page reads the token, stores it in localStorage (matching AuthContext),
 * then navigates to the dashboard.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CircleNotch as Loader2,
  XCircle as XCircle,
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  const { completeOAuth } = useAuth();

  useEffect(() => {
    // The backend redirects with a single-use, 60-second code — never a token —
    // so nothing long-lived ever sits in the URL bar or browser history.
    const code     = searchParams.get('code');
    const oauthErr = searchParams.get('error');
    window.history.replaceState(null, '', '/auth/callback');

    if (oauthErr || !code) {
      setError('Google sign-in failed. Please try again or use email/password.');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    completeOAuth(code)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((err) => {
        setError(err.response?.data?.error || 'This sign-in link has expired. Please try again.');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      });
  // Runs once per redirect; the code is single-use.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '16px',
      fontFamily: 'Inter, ui-sans-serif, sans-serif',
    }}>
      {error ? (
        <>
          <XCircle size={36} style={{ color: 'var(--red)' }} strokeWidth={1.5} />
          <p style={{ fontSize: '14px', color: 'var(--text-2)', maxWidth: '320px', textAlign: 'center' }}>{error}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Redirecting to login…</p>
        </>
      ) : (
        <>
          <div style={{ width: '22px', height: '22px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'n-spin 0.7s linear infinite' }} />
          <p style={{ fontSize: '14px', color: 'var(--text-3)' }}>Signing you in…</p>
        </>
      )}
      <style>{`@keyframes n-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default OAuthCallbackPage;
