
'use client';

import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold mb-2">Accès Refusé</h1>
      <p className="text-muted-foreground mb-6">
        Vous n'avez pas les permissions nécessaires pour accéder à cette page.
      </p>
      <Button asChild>
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  );
}
