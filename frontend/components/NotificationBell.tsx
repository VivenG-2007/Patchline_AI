'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, ShieldAlert, CheckCircle2, Info } from 'lucide-react';
import { mainApi } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: 'critical' | 'success' | 'info';
  title: string;
  message: string;
  timestamp: string;
}

const ICONS: Record<NotificationItem['type'], typeof Bell> = {
  critical: ShieldAlert,
  success: CheckCircle2,
  info: Info,
};

const TONE_CLASSES: Record<NotificationItem['type'], string> = {
  critical: 'text-critical bg-critical-soft',
  success: 'text-success bg-success-soft',
  info: 'text-info bg-info-soft',
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await mainApi.get('/api/proxy/api/v1/notifications');
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Notifications are supplementary — a failed fetch shouldn't break the shell.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markAllRead = async () => {
    if (items.length === 0) return;
    setUnreadCount(0);
    try {
      await mainApi.post('/api/proxy/api/v1/notifications/read', { lastReadId: items[0].id });
    } catch {
      // best-effort — worst case the badge reappears on next poll
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) markAllRead();
        }}
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-md border border-border text-muted hover:text-ink hover:border-border-strong transition-colors flex items-center justify-center"
      >
        <Bell size={15} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-critical text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-raised border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-rise-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Notifications</span>
            {items.length > 0 && <span className="text-[11px] text-faint">{items.length} recent</span>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</div>
            ) : (
              items.map((item) => {
                const Icon = ICONS[item.type];
                return (
                  <div key={item.id} className="px-4 py-3 border-b border-border last:border-0 flex gap-3 hover:bg-surface transition-colors">
                    <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${TONE_CLASSES[item.type]}`}>
                      <Icon size={13} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink font-medium truncate">{item.title}</div>
                      <div className="text-[12px] text-muted truncate">{item.message}</div>
                      <div className="text-[11px] text-faint mt-0.5">{timeAgo(item.timestamp)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
