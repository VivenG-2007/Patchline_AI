'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ShieldCheck } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#solutions', label: 'Solutions' },
  { href: '#architecture', label: 'Docs' },
  { href: '#pricing', label: 'Pricing' },
];

export default function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 24);
      // Only start hiding after scrolling well past the hero, and only for
      // a real downward scroll (not a tiny wobble) — reappears immediately
      // on any upward scroll, which is what makes it feel "dynamic" rather
      // than janky.
      if (y > lastY.current + 4 && y > 120) {
        setHidden(true);
      } else if (y < lastY.current - 4 || y < 120) {
        setHidden(false);
      }
      lastY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-transform duration-300 ${hidden ? '-translate-y-full' : 'translate-y-0'}`}
    >
      <div
        className={`transition-all duration-300 border-b ${
          scrolled
            ? 'bg-canvas/80 backdrop-blur-nav border-border shadow-sm'
            : 'bg-transparent border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-accent-soft border border-accent/30 flex items-center justify-center">
              <ShieldCheck size={15} className="text-accent-strong" strokeWidth={2} />
            </div>
            <span className="font-display font-semibold text-ink">PatchLine</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-muted hover:text-ink transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors px-2">
              Sign in
            </Link>
            <Link
              href="/login?mode=register"
              className="bg-accent text-white font-medium rounded-md px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
            >
              Start Scanning
            </Link>
          </div>

          <button className="md:hidden text-ink" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={22} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-canvas z-50 animate-fade-in">
          <div className="h-16 flex items-center justify-between px-6 border-b border-border">
            <span className="font-display font-semibold text-ink">PatchLine</span>
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-ink">
              <X size={22} strokeWidth={1.75} />
            </button>
          </div>
          <nav className="flex flex-col px-6 py-8 gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="text-lg text-ink py-3 border-b border-border"
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-3 mt-6">
              <ThemeToggle />
              <span className="text-sm text-muted">Toggle theme</span>
            </div>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-6 text-center border border-border-strong rounded-md py-3 text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=register"
              onClick={() => setMobileOpen(false)}
              className="mt-3 text-center bg-accent text-white rounded-md py-3 font-medium"
            >
              Start Scanning
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
