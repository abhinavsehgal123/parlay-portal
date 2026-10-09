import type { Metadata, Viewport } from 'next';
import { Archivo, Big_Shoulders, Big_Shoulders_Stencil } from 'next/font/google';
import './globals.css';

// Archivo for reading; Big Shoulders for headings and figures; its stencil cut
// only for the week number painted on the turf.
const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'] });
const display = Big_Shoulders({ variable: '--font-display', subsets: ['latin'], axes: ['opsz'] });
const stencil = Big_Shoulders_Stencil({ variable: '--font-stencil', subsets: ['latin'], weight: '900' });

export const metadata: Metadata = {
  title: 'OFF League Megalay Portal',
  description: 'Submit weekly Megalay picks and track the OFF League board.',
};

export const viewport: Viewport = {
  themeColor: '#0e4d35',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${display.variable} ${stencil.variable} antialiased`}>{children}</body>
    </html>
  );
}
