
'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect, DependencyList } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { ensureDefaultBoutique } from '@/firebase/services/boutique-default';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface UserAuthState {
  user: User | null;
  profile: any | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export interface FirebaseContextState extends UserAuthState {
  areServicesAvailable: boolean;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
}

export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

export const FirebaseProvider: React.FC<{
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}> = ({ children, firebaseApp, firestore, auth }) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    profile: null,
    isUserLoading: true,
    userError: null,
  });

  useEffect(() => {
    if (!auth || !firestore) return;

    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        unsubscribeProfile?.();
        unsubscribeProfile = undefined;

        if (firebaseUser) {
          // Mise à jour immédiate : sans cela, juste après signIn, AuthGuard voit encore
          // user === null jusqu'au 1er snapshot Firestore et renvoie vers /login.
          setUserAuthState({
            user: firebaseUser,
            profile: null,
            isUserLoading: true,
            userError: null,
          });

          const userDocRef = doc(firestore, 'users', firebaseUser.uid);

          unsubscribeProfile = onSnapshot(
            userDocRef,
            (docSnap) => {
              if (docSnap.exists()) {
                setUserAuthState((prev) => ({
                  ...prev,
                  user: firebaseUser,
                  profile: docSnap.data(),
                  isUserLoading: false,
                  userError: null,
                }));
              } else {
                // Si le profil n'existe pas encore, on le crée avec un rôle par défaut
                // L'utilisateur devra être promu Admin manuellement dans la console Firebase
                const emailLocal = firebaseUser.email?.split("@")[0] || "";
                const dn =
                  firebaseUser.displayName?.trim() ||
                  emailLocal;
                const nameParts = dn.split(/\s+/).filter(Boolean);
                const firstName = nameParts[0] || emailLocal;
                const lastName =
                  nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

                void setDoc(
                  userDocRef,
                  {
                    id: firebaseUser.uid,
                    email: firebaseUser.email,
                    firstName,
                    lastName,
                    displayName: [firstName, lastName].filter(Boolean).join(" ").trim() || dn,
                    phoneNumber: firebaseUser.phoneNumber || "",
                    role: "Vendeur",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );

                setUserAuthState((prev) => ({
                  ...prev,
                  user: firebaseUser,
                  profile: null,
                  isUserLoading: false,
                  userError: null,
                }));
              }
            },
            (error) => {
              setUserAuthState((prev) => ({
                ...prev,
                user: firebaseUser,
                isUserLoading: false,
                userError: error as Error,
              }));
            }
          );
        } else {
          setUserAuthState({
            user: null,
            profile: null,
            isUserLoading: false,
            userError: null,
          });
        }
      },
      (error) => {
        setUserAuthState({
          user: null,
          profile: null,
          isUserLoading: false,
          userError: error as Error,
        });
      }
    );

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [auth, firestore]);

  /** Garantit au moins une boutique en base (sans rattacher le profil utilisateur à un magasin). */
  const uid = userAuthState.user?.uid;
  const profileRole = userAuthState.profile?.role;

  useEffect(() => {
    if (!firestore || !uid || !userAuthState.profile) return;

    let cancelled = false;
    (async () => {
      try {
        await ensureDefaultBoutique(firestore, {
          promoteExistingWithoutFlag: profileRole === "Admin",
        });
        if (cancelled) return;
      } catch (e) {
        console.warn("[ensureDefaultBoutique]", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firestore, uid, profileRole]);

  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      ...userAuthState,
    };
  }, [firebaseApp, firestore, auth, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) throw new Error('useFirebase must be used within a FirebaseProvider.');
  return context;
};

export const useAuth = () => {
  const { auth } = useFirebase();
  if (!auth) throw new Error('Auth not available');
  return auth;
};

export const useFirestore = () => {
  const { firestore } = useFirebase();
  if (!firestore) throw new Error('Firestore not available');
  return firestore;
};

export const useUser = () => {
  const { user, profile, isUserLoading, userError } = useFirebase();
  return { user, profile, isUserLoading, userError };
};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T & { __memo?: boolean } {
  const memoized = useMemo(factory, deps);
  if (typeof memoized === 'object' && memoized !== null) {
    (memoized as any).__memo = true;
  }
  return memoized as any;
}
