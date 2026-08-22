import type { Metadata, Viewport } from 'next';
import { Geist, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, themeInitScript } from '@/context/ThemeContext';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'PatchLine — Autonomous vulnerability remediation',
  description:
    'AI-reviewed security scans with human-approved, tested pull requests. Find it. Fix it. Verify it. Ship it.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before hydration so the correct theme is painted on first
            frame — no flash of the wrong theme on load or on refresh. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
