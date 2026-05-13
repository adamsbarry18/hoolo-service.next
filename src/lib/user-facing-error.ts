/**
 * Messages d’erreur lisibles pour l’utilisateur final (sans exposer le fournisseur technique ni les codes bruts).
 */

type FirebaseLike = { code?: string; message?: string };

function asFirebaseLike(error: unknown): FirebaseLike | null {
  if (typeof error !== "object" || error === null) return null;
  const o = error as FirebaseLike;
  if (typeof o.code === "string" || typeof o.message === "string") return o;
  return null;
}

/** Retire préfixes et motifs techniques courants ; renvoie une chaîne vide si le reste n’est pas présentable. */
export function sanitizeTechnicalMessaging(text: string): string {
  if (!text?.trim()) return "";
  let t = text.trim();
  t = t.replace(/^FirebaseError:\s*/i, "");
  t = t.replace(/^Firebase:\s*/i, "");
  t = t.replace(/\s*Error\s*\([^)]*\)\.?\s*/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (/auth\/[a-z0-9_-]+/i.test(t) || /\[code=[^\]]+\]/i.test(t)) {
    return "";
  }
  return t;
}

const AUTH_FEEDBACK: Record<string, { title: string; description: string }> = {
  "auth/invalid-credential": {
    title: "Identifiants incorrects",
    description:
      "L’adresse e-mail ou le mot de passe ne correspond pas. Vérifiez votre saisie ou utilisez « Mot de passe oublié ».",
  },
  "auth/wrong-password": {
    title: "Identifiants incorrects",
    description:
      "Le mot de passe ne correspond pas à ce compte. Réessayez ou utilisez « Mot de passe oublié ».",
  },
  "auth/user-not-found": {
    title: "Compte introuvable",
    description: "Aucun compte ne correspond à cette adresse e-mail. Vérifiez l’orthographe ou créez un compte via votre administrateur.",
  },
  "auth/invalid-email": {
    title: "E-mail invalide",
    description: "Le format de l’adresse e-mail n’est pas reconnu. Corrigez-la et réessayez.",
  },
  "auth/user-disabled": {
    title: "Compte désactivé",
    description: "Ce compte a été désactivé. Contactez votre administrateur.",
  },
  "auth/too-many-requests": {
    title: "Trop de tentatives",
    description: "Pour des raisons de sécurité, réessayez dans quelques minutes.",
  },
  "auth/network-request-failed": {
    title: "Problème de connexion",
    description: "Impossible de joindre le serveur. Vérifiez votre connexion Internet et réessayez.",
  },
  "auth/requires-recent-login": {
    title: "Nouvelle connexion requise",
    description: "Pour des raisons de sécurité, déconnectez-vous puis reconnectez-vous avant de réessayer cette action.",
  },
  "auth/email-already-in-use": {
    title: "E-mail déjà utilisé",
    description: "Un compte existe déjà avec cette adresse e-mail.",
  },
  "auth/weak-password": {
    title: "Mot de passe trop faible",
    description: "Choisissez un mot de passe d’au moins 6 caractères, idéalement plus long et varié.",
  },
  "auth/operation-not-allowed": {
    title: "Connexion non disponible",
    description: "Cette méthode de connexion n’est pas activée. Contactez votre administrateur.",
  },
  "auth/internal-error": {
    title: "Erreur temporaire",
    description: "Une erreur interne s’est produite. Réessayez dans quelques instants.",
  },
  "auth/invalid-api-key": {
    title: "Configuration incorrecte",
    description: "L’application n’est pas correctement configurée. Contactez le support technique.",
  },
  "auth/app-deleted": {
    title: "Service indisponible",
    description: "Le service d’authentification n’est plus disponible. Contactez le support.",
  },
  "auth/credential-already-in-use": {
    title: "Identifiant déjà lié",
    description: "Ces identifiants sont déjà associés à un autre compte.",
  },
  "auth/account-exists-with-different-credential": {
    title: "Compte déjà existant",
    description: "Un compte existe déjà avec cette adresse, peut-être via une autre méthode de connexion. Utilisez l’e-mail / mot de passe habituels.",
  },
  "auth/missing-email": {
    title: "E-mail manquant",
    description: "Indiquez une adresse e-mail valide.",
  },
  "auth/invalid-password": {
    title: "Mot de passe invalide",
    description: "Le mot de passe fourni n’est pas valide. Vérifiez votre saisie.",
  },
};

export type UserFacingErrorFeedback = {
  title: string;
  description: string;
  /** Pour les cas « silencieux » (ex. reset sans révéler si l’e-mail existe). */
  variant?: "default" | "destructive";
};

const PASSWORD_RESET_NEUTRAL: UserFacingErrorFeedback = {
  title: "Demande enregistrée",
  description:
    "Si cette adresse est associée à un compte, vous recevrez sous peu un lien pour réinitialiser votre mot de passe. Pensez à vérifier les courriers indésirables.",
  variant: "default",
};

const DEFAULT_FEEDBACK: UserFacingErrorFeedback = {
  title: "Une erreur est survenue",
  description:
    "Impossible de terminer l’action. Réessayez dans un instant. Si le problème persiste, contactez un administrateur.",
};

export type AuthErrorOperation = "signIn" | "passwordReset" | "changePassword" | "createUser";

/**
 * Libellés pour erreurs Firebase Auth (et assimilées) affichés en toast ou inline.
 */
export function getAuthErrorFeedback(
  error: unknown,
  operation: AuthErrorOperation = "signIn"
): UserFacingErrorFeedback {
  const fb = asFirebaseLike(error);
  const code = fb?.code;

  if (operation === "passwordReset" && code === "auth/user-not-found") {
    return PASSWORD_RESET_NEUTRAL;
  }

  if (code && AUTH_FEEDBACK[code]) {
    return { ...AUTH_FEEDBACK[code] };
  }

  const sanitized = sanitizeTechnicalMessaging(fb?.message ?? (error instanceof Error ? error.message : ""));
  if (sanitized.length > 3) {
    return { title: DEFAULT_FEEDBACK.title, description: sanitized };
  }

  return DEFAULT_FEEDBACK;
}

const FIRESTORE_USER_MESSAGES: Record<string, string> = {
  "permission-denied": "Vous n’avez pas les droits nécessaires pour cette action.",
  unavailable: "Service temporairement indisponible. Réessayez dans quelques instants.",
  "failed-precondition": "Cette opération ne peut pas être effectuée dans l’état actuel.",
  "not-found": "L’élément demandé est introuvable ou a été supprimé.",
  "already-exists": "Cet enregistrement existe déjà.",
  "resource-exhausted": "Limite temporairement atteinte. Réessayez plus tard.",
  unauthenticated: "Votre session a expiré. Reconnectez-vous.",
  "deadline-exceeded": "La requête a expiré. Vérifiez votre connexion et réessayez.",
  aborted: "L’opération a été interrompue. Réessayez.",
  cancelled: "L’opération a été annulée.",
};

/**
 * Message unique pour les blocs catch génériques (Firestore, réseau, etc.), sans jargon technique.
 */
export function toUserFacingErrorMessage(
  error: unknown,
  fallback = "Une erreur inattendue s’est produite. Réessayez ou contactez un administrateur."
): string {
  const fb = asFirebaseLike(error);
  const code = fb?.code;

  if (code?.startsWith("auth/")) {
    return getAuthErrorFeedback(error, "signIn").description;
  }

  if (code && FIRESTORE_USER_MESSAGES[code]) {
    return FIRESTORE_USER_MESSAGES[code];
  }

  const sanitized = sanitizeTechnicalMessaging(fb?.message ?? (error instanceof Error ? error.message : ""));
  if (sanitized.length > 3) {
    return sanitized;
  }

  return fallback;
}
