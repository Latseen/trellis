import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trellis — NYC Green Roof Checker',
  description: 'Check green roof suitability for any NYC building',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
