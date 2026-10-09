import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

// Archivo's width axis drives the condensed display type.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
});

export const metadata: Metadata = {
  title: 'OFF League Megalay Portal',
  description: 'Submit weekly Megalay picks and track the OFF League board.',
};

export const viewport: Viewport = {
  themeColor: '#07152f',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} antialiased`}>{children}</body>
    </html>
  );
}
