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
  ChevronRight,
  Activity,
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
      <div className="h-16 flex items-center px-5 border-b border-border-default shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 group" onClick={onNavigate}>
          <div className="w-8 h-8 rounded-xl bg-accent-cyan-soft border border-accent-cyan/30 flex items-center justify-center text-accent-cyan shadow-sm group-hover:scale-105 transition-transform">
            <ShieldCheck size={17} strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-text-primary text-[15px] tracking-tight">
              PatchLine <span className="text-accent-cyan font-mono text-xs">AI</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent-emerald">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald pulse-dot" />
              Engine Online
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
          Platform Navigation
        </div>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-accent-cyan-soft text-accent-cyan font-semibold shadow-sm border border-accent-cyan/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.75} />
              {label}
            </Link>
          );
        })}

        {setupIncomplete && (
          <Link
            href="/onboarding"
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-accent-amber hover:bg-bg-subtle transition-colors mt-3 border border-dashed border-accent-amber/30 font-mono"
          >
            <CircleDot size={14} strokeWidth={2} />
            Finish Setup
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

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileNavOpen(false);
  }

  if (loading) {
    return <LoadingScreen title="Signing you in…" subtitle="Verifying your session and loading your workspace." durationMs={1400} />;
  }
  if (!user) return null;

  // Breadcrumbs calculation
  const pathSegments = (pathname || '/').split('/').filter(Boolean);

  return (
    <div className="min-h-screen bg-bg-base flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border-default bg-bg-card flex-col z-20">
        <SidebarContent pathname={pathname} setupIncomplete={setupIncomplete} />
        <div className="px-3 py-4 border-t border-border-default shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-subtle/50 border border-border-default">
            <div className="w-7 h-7 rounded-lg bg-accent-cyan-soft border border-accent-cyan/30 flex items-center justify-center font-mono text-[11px] font-bold text-accent-cyan shrink-0">
              {user.email.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-text-primary font-mono truncate">{user.email}</div>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              aria-label="Log out"
              className="text-text-muted hover:text-accent-rose shrink-0 transition-colors p-1"
            >
              <LogOut size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-bg-card border-r border-border-default flex flex-col animate-slide-in-right z-50">
            <SidebarContent pathname={pathname} setupIncomplete={setupIncomplete} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navbar with breadcrumbs and theme controls */}
        <header className="h-16 shrink-0 border-b border-border-default flex items-center justify-between gap-3 px-4 md:px-8 bg-bg-card/90 backdrop-blur-nav sticky top-0 z-30">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              className="md:hidden text-text-secondary hover:text-text-primary shrink-0"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>

            {/* Breadcrumb Navigation */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-text-muted">
              <Link href="/dashboard" className="hover:text-text-primary transition-colors">
                PatchLine
              </Link>
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <ChevronRight size={11} className="text-text-muted" />
                  <span className={i === pathSegments.length - 1 ? 'text-text-primary font-semibold capitalize' : 'hover:text-text-primary transition-colors capitalize'}>
                    {seg}
                  </span>
                </span>
              ))}
            </div>

            <div className="w-full max-w-xs ml-auto sm:ml-4">
              <CommandSearch />
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
