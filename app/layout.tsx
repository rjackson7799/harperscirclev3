import type { Metadata } from 'next';
import { Newsreader, Hanken_Grotesk } from 'next/font/google';
import './globals.css';

// design_spec §3: Newsreader (display serif) + Hanken Grotesk (everything
// else), loaded with swap per §9.
const newsreader = Newsreader({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const hanken = Hanken_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Harper's Circle",
  description: 'One place for everything about the person you look after.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
