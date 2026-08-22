'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

type Status = 'checking' | 'up' | 'down';

interface ServiceDef {
  label: string;
  url: string;
}

// Pings each backend's /health from the browser — a lightweight, visible
// confirmation that the stack is actually wired up end to end, not just a
// decorative status list.
export default function ServiceStatus() {
  const services: ServiceDef[] = [
    { label: 'auth-service', url: `${process.env.NEXT_PUBLIC_AUTH_API_URL}/health` },
    { label: 'main-service', url: `${process.env.NEXT_PUBLIC_MAIN_API_URL}/health` },
  ];
  const [statuses, setStatuses] = useState<Record<string, Status>>(
    Object.fromEntries(services.map((s) => [s.label, 'checking']))
  );

  useEffect(() => {
    services.forEach((s) => {
      axios
        .get(s.url, { timeout: 4000 })
        .then(() => setStatuses((prev) => ({ ...prev, [s.label]: 'up' })))
        .catch(() => setStatuses((prev) => ({ ...prev, [s.label]: 'down' })));
    });
    // ai-storage-service is intentionally not pinged directly — it's only
    // reached through main-service's proxy in this template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dotColor = (s: Status) => (s === 'up' ? 'bg-success' : s === 'down' ? 'bg-critical' : 'bg-faint');
  const textColor = (s: Status) => (s === 'up' ? 'text-success' : s === 'down' ? 'text-critical' : 'text-faint');

  return (
    <div className="border border-border rounded-xl p-5 bg-surface font-mono text-xs">
      <div className="text-muted uppercase tracking-wider text-[10px] mb-3">System status</div>
      <div className="space-y-2.5">
        {services.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-ink/80">{s.label}</span>
            <span className={`flex items-center gap-1.5 ${textColor(statuses[s.label])}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor(statuses[s.label])} ${statuses[s.label] === 'checking' ? 'pulse-dot' : ''}`} />
              {statuses[s.label] === 'checking' ? 'checking' : statuses[s.label] === 'up' ? 'online' : 'unreachable'}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between opacity-50">
          <span className="text-ink/80">ai-storage-service</span>
          <span className="text-faint">behind proxy</span>
        </div>
      </div>
    </div>
  );
}
