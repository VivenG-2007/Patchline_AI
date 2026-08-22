'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Radar,
  History,
  Github,
  Workflow,
  Sparkles,
  LogOut,
  CircleDot,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getConnectionStatus } from '@/lib/api';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import CommandSearch from './CommandSearch';
import LoadingScreen from './LoadingScreen';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scanner', label: 'Vulnerabilities', icon: Radar },
  { href: '/scanner/history', label: 'History', icon: History },
  { href: '/github', label: 'Repositories', icon: Github },
  { href: '/jira', label: 'Integrations', icon: Workflow },
  { href: '/upload', label: 'AI & files', icon: Sparkles },
];

function SidebarContent({
  pathname,
  setupIncomplete,
  onNavigate,
}: {
  pathname: string | null;
  setupIncomplete: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="h-16 flex items-center px-5 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <div className="w-7 h-7 rounded-md bg-accent-soft border border-accent/30 flex items-center justify-center">
            <ShieldCheck size={15} className="text-accent-strong" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold text-ink text-[15px]">PatchLine AI</div>
            <div className="flex items-center gap-1.5 text-[10px] text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
              Agent Active
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-accent-soft text-accent-strong font-medium'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}

        {setupIncomplete && (
          <Link
            href="/onboarding"
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-warning hover:bg-surface transition-colors mt-2"
          >
            <CircleDot size={14} strokeWidth={2} />
            Finish setup
          </Link>
        )}
      </nav>
    </>
  );
}

export default function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    getConnectionStatus().then(({ githubConnected, jiraConnected }) => {
      setSetupIncomplete(!githubConnected || !jiraConnected);
    });
  }, [user, pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading) {
    return <LoadingScreen title="Signing you in…" subtitle="Verifying your session and loading your workspace." durationMs={1400} />;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Desktop / tablet sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border flex-col">
        <SidebarContent pathname={pathname} setupIncomplete={setupIncomplete} />
        <div className="px-3 py-4 border-t border-border shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full bg-surface-raised border border-border-strong flex items-center justify-center font-mono text-[11px] text-muted shrink-0">
              {user.email.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink truncate">{user.email}</div>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              aria-label="Log out"
              className="text-muted hover:text-critical shrink-0 transition-colors"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-canvas border-r border-border flex flex-col animate-fade-rise-in">
            <SidebarContent pathname={pathname} setupIncomplete={setupIncomplete} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-border flex items-center gap-3 px-4 md:px-6 bg-canvas/95 backdrop-blur-nav sticky top-0 z-30">
          <button
            className="md:hidden text-muted hover:text-ink shrink-0"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>

          <CommandSearch />

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-10 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
