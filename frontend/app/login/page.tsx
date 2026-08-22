'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { getConnectionStatus } from '@/lib/api';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/ThemeToggle';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const isRegister = params.get('mode') === 'register';
  const { login, register, error } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(name, email, password);
        // A brand-new account has nothing connected yet — always onboard.
        router.push('/onboarding');
      } else {
        await login(email, password);
        // Returning user: only detour through onboarding if something is
        // still unconnected, so people who already set up GitHub/Jira go
        // straight to the dashboard on every subsequent login.
        const { githubConnected, jiraConnected } = await getConnectionStatus();
        router.push(githubConnected && jiraConnected ? '/dashboard' : '/onboarding');
      }
    } catch {
      // error is already surfaced via useAuth().error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas grid-overlay flex items-center justify-center px-6 relative">
      <ThemeToggle className="absolute top-6 right-6" />
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-10 w-fit">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="font-display font-medium text-ink">Patchline</span>
        </Link>

        <span className="font-mono text-xs tracking-widest text-accent-strong uppercase">
          {isRegister ? 'Create account' : 'Welcome back'}
        </span>
        <h1 className="font-display text-2xl mt-2 mb-8 text-ink">
          {isRegister ? 'Set up your workspace' : 'Log in to Patchline'}
        </h1>

        <form onSubmit={onSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs text-muted mb-1.5">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted mb-1.5">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
            />
          </div>

          {error && <Alert tone="critical">{error}</Alert>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Working…' : isRegister ? 'Create account' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted">
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <Link href={isRegister ? '/login' : '/login?mode=register'} className="text-accent-strong hover:text-accent">
            {isRegister ? 'Log in' : 'Register'}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
