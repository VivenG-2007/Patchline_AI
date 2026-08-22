import type { Metadata, Viewport } from 'next';
import { Geist, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, themeInitScript } from '@/context/ThemeContext';
import { ToastProvider } from '@/components/ToastNotification';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
  preload: true,
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'PatchLine — Autonomous Vulnerability Remediation & Security Intelligence',
  description:
    'AI-reviewed security scans with human-approved, tested pull requests. Find it. Fix it. Verify it. Ship it.',
  keywords: ['security scanner', 'vulnerability remediation', 'SAST', 'AI patch generation', 'OWASP', 'CWE'],
  authors: [{ name: 'PatchLine AI' }],
  metadataBase: new URL('https://patchline.ai'),
  openGraph: {
    title: 'PatchLine — Autonomous Vulnerability Remediation',
    description: 'Find it. Fix it. Verify it. Ship it. Zero-regression automated security patches.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070a12' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Anti-flicker pre-hydration script */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased min-h-screen bg-bg-base text-text-primary" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
