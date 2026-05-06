import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { SonnerProvider } from '@/components/providers/sonner-provider';
import { FirebaseClientProvider } from '@/firebase/client-provider';

export const metadata: Metadata = {
  title: 'HooloBiz Manager - Gestion Commerciale',
  description: 'Logiciel de gestion pour Hoolo Service - Vente, Stock, Réparations',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/images/favicon-32x32.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/images/favicon-16x16.ico', sizes: '16x16', type: 'image/x-icon' },
    ],
    apple: '/images/apple-touch-icon.png',
    other: [
      {
        rel: 'icon',
        type: 'image/png',
        url: '/images/android-chrome-192x192.png',
        sizes: '192x192',
      },
      {
        rel: 'icon',
        type: 'image/png',
        url: '/images/android-chrome-512x512.png',
        sizes: '512x512',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background">
        <FirebaseClientProvider>
          <SidebarProvider defaultOpen={true}>
            {children}
          </SidebarProvider>
          <Toaster />
          <SonnerProvider />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
