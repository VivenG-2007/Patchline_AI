import Link from 'next/link';
import { ArrowRight, ShieldCheck, GitPullRequest, Radar, Sparkles } from 'lucide-react';
import ServiceStatus from '@/components/ServiceStatus';
import TopNav from '@/components/TopNav';

const PILLARS = [
  {
    icon: Radar,
    title: 'Find it',
    body: 'Point it at a repository. Deterministic + AI analysis returns findings with severity, file, and line — no dashboard spelunking.',
  },
  {
    icon: ShieldCheck,
    title: 'Fix it',
    body: 'Every fix is generated on an isolated branch and held for approval. Nothing merges without a human.',
  },
  {
    icon: Sparkles,
    title: 'Verify it',
    body: 'The generated patch is independently re-checked — tests, static rules, and an AI review — before it ever reaches you.',
  },
  {
    icon: GitPullRequest,
    title: 'Ship it',
    body: 'Approve a finding and a tested pull request opens on GitHub, ready for normal code review.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-canvas">
      <TopNav />

      {/* Hero — pt-16 offsets the fixed header height */}
      <section className="relative overflow-hidden grid-overlay pt-16">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
          <span className="inline-flex items-center gap-2 font-mono text-xs text-accent-strong border border-accent/25 bg-accent-soft rounded-full px-3 py-1">
            PatchLine AI Engine v2.0 Live
          </span>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] tracking-tight mt-6 text-ink">
            Find it. <span className="text-accent-strong">Fix it.</span> Verify it.{' '}
            <span className="text-success">Ship it.</span>
          </h1>
          <p className="mt-6 text-muted text-lg leading-relaxed max-w-xl mx-auto">
            Autonomous AI remediation for modern engineering teams. Stop triaging vulnerabilities
            and start shipping secure code automatically.
          </p>
          <div className="mt-9 flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center gap-2 bg-accent text-white font-medium rounded-md px-5 py-3 text-sm hover:bg-accent-strong transition-colors"
            >
              Start Scanning <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-border-strong text-ink font-medium rounded-md px-5 py-3 text-sm hover:bg-surface transition-colors"
            >
              I already have an account
            </Link>
          </div>

          {/* Signature element: a live-looking console card, the literal
              product moment — a finding awaiting human approval. */}
          <div className="relative mt-16 max-w-3xl mx-auto">
            <div className="relative bg-surface border border-border rounded-xl overflow-hidden shadow-2xl shadow-black/20 text-left">
              <div className="scanline opacity-60" />
              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
                <div className="p-4">
                  <div className="font-mono text-[10px] text-accent uppercase tracking-wide mb-2">Scan pipeline</div>
                  <div className="text-xs text-muted space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Analyzing dependencies…
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Scanning source code…
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-critical pulse-dot" /> Critical finding detected
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="font-mono text-[10px] text-critical uppercase tracking-wide mb-2">Vulnerability</div>
                  <div className="text-xs text-ink font-mono mb-1">CVE-2023-4567</div>
                  <div className="text-xs text-muted leading-relaxed">Remote Code Execution in YAML Parser</div>
                  <div className="text-[11px] font-mono text-faint mt-2">− version: 1.2.4</div>
                </div>
                <div className="p-4">
                  <div className="font-mono text-[10px] text-accent-strong uppercase tracking-wide mb-2">AI remediation</div>
                  <div className="text-xs text-ink mb-1">Fix Proposed</div>
                  <div className="text-xs text-muted leading-relaxed mb-2">Updating dependency &amp; patching calls</div>
                  <div className="text-[11px] font-mono text-success">+ version: 1.2.5</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="product" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="font-display text-2xl text-ink text-center mb-12">Trusted engineering workflow</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-accent-strong mb-4">
                  <Icon size={16} strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-lg text-ink mb-2">{title}</h3>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture + status */}
      <section id="architecture" className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-start">
          <div>
            <span className="font-mono text-xs tracking-widest text-accent-strong uppercase">Under the hood</span>
            <h2 className="font-display text-2xl mt-2 mb-6 text-ink">Three services, one clear boundary</h2>
            <div className="space-y-4 font-mono text-sm">
              {[
                ['auth', 'RS256 tokens, httpOnly cookies, rotating refresh — the only service holding the private key.'],
                ['main', 'Product API against Supabase and Redis. Verifies every token locally, in-process.'],
                ['ai + storage', 'Python/FastAPI. Pluggable model provider, Mongo, Elasticsearch, Azure Blob — reached only through the gateway.'],
              ].map(([name, desc]) => (
                <div key={name} className="flex gap-4 border-l border-border pl-4 py-1">
                  <div>
                    <div className="text-ink">{name}</div>
                    <div className="text-muted text-xs mt-1 leading-relaxed font-sans">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <ServiceStatus />
            <p className="mt-3 text-xs text-faint font-mono leading-relaxed">
              Set NEXT_PUBLIC_AUTH_API_URL / NEXT_PUBLIC_MAIN_API_URL and start the backends to see this go live.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-faint font-mono">
          <span>© {new Date().getFullYear()} PatchLine AI</span>
          <span>Built on auth-service · main-service · ai-storage-service</span>
        </div>
      </footer>
    </main>
  );
}
