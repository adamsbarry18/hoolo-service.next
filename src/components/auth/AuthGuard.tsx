
'use client';

import { useUser } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, profile, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      if (pathname !== '/login') {
        router.push('/login');
      }
    } else {
      if (pathname === '/login') {
        router.push('/');
      } else if (requireAdmin && profile?.role !== 'Admin') {
        router.push('/forbidden');
      }
    }
  }, [user, profile, isUserLoading, router, requireAdmin, pathname]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && pathname !== '/login') return null;
  if (user && pathname === '/login') return null;
  if (user && requireAdmin && profile?.role !== 'Admin') return null;

  return <>{children}</>;
}
