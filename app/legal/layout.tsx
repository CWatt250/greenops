import Link from 'next/link';
import Image from 'next/image';

/** Public legal pages: readable prose column, no app chrome, no auth. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/tlc-logo.png" alt="TLC Landscape Management" width={275} height={120} className="h-8 w-auto" />
            <span className="text-xs font-semibold text-muted-foreground">Management Platform</span>
          </Link>
          <nav className="flex gap-4 text-xs font-medium">
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-bold [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </main>
      <footer className="mx-auto max-w-2xl px-5 pb-10 text-xs text-muted-foreground">
        Watt Systems · <a href="mailto:support@watt-systems.com" className="hover:underline">support@watt-systems.com</a>
      </footer>
    </div>
  );
}
