'use client';

import { Inter } from 'next/font/google';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';
import styles from './layout.module.css';

const inter = Inter({ 
  subsets: ['latin'], 
  weight: ['300', '400', '500', '600', '700'] 
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <title>Dataset ATRBPN - Viewer</title>
        <meta name="description" content="Web viewer for ATRBPN notaris dataset" />
      </head>
      <body className={inter.className} style={{ backgroundColor: '#0a0a0c', color: '#e2e8f0', margin: 0 }}>
        <aside className={styles.sidebar}>
          <div className={styles.logoArea}>
            <h1>📋 ATRBPN</h1>
            <div className={styles.subtitle}>Dataset Viewer</div>
          </div>
          <nav className={styles.nav}>
            <Link 
              href="/" 
              className={`${styles.navLink} ${pathname === '/' ? styles.navLinkActive : ''}`}
            >
              🏠 Dashboard
            </Link>
          </nav>
          <div className={styles.footer}>
            v1.0.0
          </div>
        </aside>
        <main className={styles.mainContent}>
          {children}
        </main>
      </body>
    </html>
  );
}
