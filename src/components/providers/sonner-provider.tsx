'use client';

import { Toaster } from 'sonner';

export function SonnerProvider() {
  return (
    <Toaster
      richColors
      closeButton
      position="top-center"
      toastOptions={{ classNames: { title: 'font-semibold', description: 'text-sm' } }}
    />
  );
}
