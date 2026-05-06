"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebaseConfig } from "@/firebase/config";

const SECONDARY_APP_NAME = "hoolo-secondary-create-user";

/**
 * Instance Auth isolée pour `createUserWithEmailAndPassword` depuis l’espace admin.
 * Sans cela, la création de compte remplacerait la session de l’administrateur connecté.
 */
export function getAuthForAdminUserCreation(): Auth {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME) as
    | FirebaseApp
    | undefined;
  const app = existing ?? initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(app);
}
