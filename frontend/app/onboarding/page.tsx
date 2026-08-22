'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github as GithubIcon, Workflow, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { githubApi, jiraApi, getConnectionStatus } from '@/lib/api';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import ThemeToggle from '@/components/ThemeToggle';

type Step = 1 | 2 | 3;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'GitHub' },
  { step: 2, label: 'Jira' },
  { step: 3, label: 'Done' },
];

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [resolving, setResolving] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [githubConnected, setGithubConnected] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);

  const oauthError = params.get('error');
  const justConnected = params.get('provider');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // On every load — including landing back here after an OAuth redirect —
  // re-check both connections against the backend rather than trusting the
  // URL alone, then use the ?step param (if present) or the connection
  // state itself to decide which step to land on.
  useEffect(() => {
    if (!user) return;
    getConnectionStatus().then(({ githubConnected, jiraConnected }) => {
      setGithubConnected(githubConnected);
      setJiraConnected(jiraConnected);

      const stepParam = Number(params.get('step'));
      if (stepParam === 1 || stepParam === 2 || stepParam === 3) {
        setStep(stepParam as Step);
      } else if (!githubConnected) {
        setStep(1);
      } else if (!jiraConnected) {
        setStep(2);
      } else {
        setStep(3);
      }
      setResolving(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (authLoading || resolving) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" />
      </div>
    );
  }
  if (!user) return null;

  const goToStep = (s: Step) => {
    setStep(s);
    router.replace(`/onboarding?step=${s}`);
  };

  return (
    <div className="min-h-screen bg-canvas grid-overlay flex items-center justify-center px-6 py-16 relative">
      <ThemeToggle className="absolute top-6 right-6" />
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-10">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="font-display font-medium text-ink">Patchline</span>
        </div>

        {/* Sequential progress indicator — a real fixed order (GitHub, then
            Jira), so numbering it is informative, not decorative. */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map(({ step: s, label }, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-mono shrink-0 border transition-colors ${
                  step > s
                    ? 'bg-success-soft border-success/40 text-success'
                    : step === s
                    ? 'bg-accent-soft border-accent text-accent-strong'
                    : 'bg-surface border-border text-faint'
                }`}
              >
                {step > s ? <Check size={12} /> : s}
              </div>
              <span className={`text-xs ${step >= s ? 'text-ink' : 'text-faint'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px ${step > s ? 'bg-success/40' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {oauthError && (
          <Alert className="mb-6">Connection failed: {oauthError}</Alert>
        )}
        {justConnected && !oauthError && (
          <Alert tone="success" className="mb-6">
            {justConnected === 'github' ? 'GitHub' : 'Jira'} connected.
          </Alert>
        )}

        {step === 1 && (
          <StepCard
            icon={GithubIcon}
            eyebrow="Step 1 of 2"
            title="Connect GitHub"
            description="Patchline scans your repositories and opens pull requests once a fix is approved. It never sees your GitHub password, and the token is encrypted at rest."
            connected={githubConnected}
            connectHref={githubApi.connectUrl('/onboarding?step=2')}
            connectLabel="Connect GitHub"
            onSkip={() => goToStep(2)}
            onContinue={() => goToStep(2)}
          />
        )}

        {step === 2 && (
          <StepCard
            icon={Workflow}
            eyebrow="Step 2 of 2"
            title="Connect Jira"
            description="Optional — Patchline can open a Jira ticket automatically when a scan finds something. Skip this if you don't use Jira."
            connected={jiraConnected}
            connectHref={jiraApi.connectUrl('/onboarding?step=3')}
            connectLabel="Connect Jira"
            onSkip={() => goToStep(3)}
            onContinue={() => goToStep(3)}
          />
        )}

        {step === 3 && (
          <div>
            <div className="w-10 h-10 rounded-lg bg-success-soft border border-success/30 flex items-center justify-center text-success mb-5">
              <Check size={18} strokeWidth={2} />
            </div>
            <h1 className="font-display text-2xl text-ink mb-2">You&apos;re set up</h1>
            <p className="text-muted text-sm mb-6 leading-relaxed">
              {githubConnected ? 'GitHub is connected.' : "GitHub isn't connected yet — you can add it later from the sidebar."}{' '}
              {jiraConnected ? 'Jira is connected too.' : "Jira wasn't connected — that's fine, it's optional."}
            </p>
            <Button onClick={() => router.push('/dashboard')} className="w-full gap-2">
              Go to dashboard <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  connected,
  connectHref,
  connectLabel,
  onSkip,
  onContinue,
}: {
  icon: typeof GithubIcon;
  eyebrow: string;
  title: string;
  description: string;
  connected: boolean;
  connectHref: string;
  connectLabel: string;
  onSkip: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <span className="font-mono text-xs tracking-widest text-accent-strong uppercase">{eyebrow}</span>
      <h1 className="font-display text-2xl mt-2 mb-2 text-ink">{title}</h1>
      <p className="text-muted text-sm mb-7 leading-relaxed">{description}</p>

      {connected ? (
        <div className="flex items-center gap-2 text-success text-sm mb-4">
          <Check size={15} /> Already connected
        </div>
      ) : (
        <a href={connectHref} className="block mb-4">
          <Button className="w-full gap-2">
            <Icon size={15} /> {connectLabel}
          </Button>
        </a>
      )}

      {connected ? (
        <Button variant="secondary" onClick={onContinue} className="w-full">
          Continue
        </Button>
      ) : (
        <button onClick={onSkip} className="text-sm text-muted hover:text-ink transition-colors w-full text-center py-2">
          Skip for now
        </button>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}
