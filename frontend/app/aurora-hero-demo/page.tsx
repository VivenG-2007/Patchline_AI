'use client';

import { AuroraHero } from '@/components/ui/aurora-hero';

export default function AuroraHeroDemoPage() {
  return (
    <AuroraHero
      badgeText="PatchLine AI v2.0 Live"
      title={
        <>
          Autonomous Vulnerability <span className="text-white">Remediation</span>
        </>
      }
      description="Find security flaws, synthesize isolated GPT-5.2 patches, certify zero regressions, and open verified GitHub Pull Requests in minutes."
      ctaText="Launch Free Scanner"
      ctaHref="/login?mode=register"
    />
  );
}
