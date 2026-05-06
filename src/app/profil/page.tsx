
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  UserCircle,
  Loader2,
  Mail,
  Shield,
  Building2,
  Phone,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { useFirestore, useUser, useAuth } from "@/firebase";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { userAvatarInlineStyle, userInitialsFromNames } from "@/lib/user-avatar";

function buildDisplayName(firstName: string, lastName: string, email: string): string {
  const full = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (full) return full;
  return email.trim().split("@")[0] || "";
}

export default function ProfilPage() {
  const { user, profile, isUserLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const { activeBoutiqueId, boutiques, loading: boutiquesLoading } = useBoutiqueScope();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isPwSaving, setIsPwSaving] = useState(false);

  const activeBoutique = useMemo(
    () => boutiques.find((b) => b.id === activeBoutiqueId),
    [boutiques, activeBoutiqueId]
  );

  const canChangePassword = useMemo(
    () =>
      Boolean(
        user?.providerData?.some((p) => p.providerId === EmailAuthProvider.PROVIDER_ID)
      ),
    [user]
  );

  useEffect(() => {
    if (!profile) return;
    setFirstName(typeof profile.firstName === "string" ? profile.firstName : "");
    setLastName(typeof profile.lastName === "string" ? profile.lastName : "");
    setPhoneNumber(typeof profile.phoneNumber === "string" ? profile.phoneNumber : "");
  }, [profile?.firstName, profile?.lastName, profile?.phoneNumber]);

  const displayNamePreview =
    [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ").trim() ||
    profile?.displayName ||
    user?.email?.split("@")[0] ||
    "-";

  const initials = userInitialsFromNames(firstName, lastName, {
    displayName: profile?.displayName,
    email: user?.email,
  });
  const avatarStyle = userAvatarInlineStyle(user?.uid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user) return;

    setIsSaving(true);
    try {
      const email = user.email ?? "";
      const nextDisplayName = buildDisplayName(firstName, lastName, email);

      await updateDoc(doc(firestore, "users", user.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
        displayName: nextDisplayName,
        updatedAt: serverTimestamp(),
      });

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: nextDisplayName });
      }

      toast({
        title: "Profil enregistré",
        description: "Vos informations ont été mises à jour.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;

    if (!currentPassword) {
      toast({
        variant: "destructive",
        title: "Mot de passe actuel requis",
        description: "Saisissez votre mot de passe actuel pour confirmer votre identité.",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Nouveau mot de passe trop court",
        description: "Au moins 6 caractères (exigence Firebase).",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Confirmation incorrecte",
        description: "Le nouveau mot de passe et sa confirmation ne correspondent pas.",
      });
      return;
    }

    setIsPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Mot de passe mis à jour",
        description: "Utilisez-le dès votre prochaine connexion sur un autre appareil.",
      });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      const message = (error as Error)?.message;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast({
          variant: "destructive",
          title: "Mot de passe actuel incorrect",
          description: "Vérifiez votre saisie ou utilisez « Mot de passe oublié » sur l’écran de connexion.",
        });
      } else if (code === "auth/weak-password") {
        toast({
          variant: "destructive",
          title: "Mot de passe trop faible",
          description: message ?? "Choisissez un mot de passe plus long.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Impossible de changer le mot de passe",
          description: message ?? String(error),
        });
      }
    } finally {
      setIsPwSaving(false);
    }
  };

  if (isUserLoading) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Chargement du profil…</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <UserCircle className="mb-3 h-12 w-12 opacity-40" />
          <p>Connectez-vous pour accéder à votre profil.</p>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Chargement du profil…</p>
        </div>
      </AppLayout>
    );
  }

  const roleLabel =
    profile.role === "Admin"
      ? "Administrateur"
      : profile.role === "Vendeur"
        ? "Vendeur"
        : (profile.role as string) || "-";

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <UserCircle className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-primary">Mon profil</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="h-16 w-16 border-2 border-muted">
                <AvatarFallback className="text-lg font-semibold" style={avatarStyle}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <CardTitle className="text-xl leading-tight">{displayNamePreview}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {user.email || "-"}
                  </span>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Shield className="h-3 w-3" />
                    {roleLabel}
                  </Badge>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                <Building2 className="h-3.5 w-3.5" />
                Boutique active (travail courant)
              </p>
              {activeBoutiqueId ? (
                boutiquesLoading ? (
                  <p className="text-muted-foreground text-sm">Chargement…</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {activeBoutique?.name?.trim() || "Boutique"}
                    </p>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Changez de magasin via le menu en haut de l&apos;écran. L&apos;accès couvre toutes les
                      boutiques ({boutiques.length} enregistrée{boutiques.length > 1 ? "s" : ""}).
                    </p>
                  </div>
                )
              ) : (
                <p className="text-muted-foreground text-sm">
                  Aucun magasin disponible. Créez une boutique ou vérifiez la connexion.
                </p>
              )}
            </div>

            <Separator />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profil-first">Prénom</Label>
                  <Input
                    id="profil-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Votre prénom"
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profil-last">Nom</Label>
                  <Input
                    id="profil-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Votre nom"
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profil-phone" className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Téléphone
                </Label>
                <Input
                  id="profil-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+224 …"
                  autoComplete="tel"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Le rôle (Admin / Vendeur) est géré par un administrateur sur la page Personnel. Le magasin actif se
                choisit dans l’en-tête.
              </p>
              <Button type="submit" className="bg-primary w-full sm:w-auto" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer les modifications"}
              </Button>
            </form>

            {canChangePassword ? (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">Mot de passe</h2>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Pour votre sécurité, votre mot de passe actuel est demandé avant toute modification.
                  </p>
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="profil-cur-pw">Mot de passe actuel</Label>
                      <div className="relative">
                        <Input
                          id="profil-cur-pw"
                          type={showCurrentPw ? "text" : "password"}
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowCurrentPw((v) => !v)}
                          aria-label={showCurrentPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profil-new-pw">Nouveau mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="profil-new-pw"
                          type={showNewPw ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowNewPw((v) => !v)}
                          aria-label={showNewPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profil-confirm-pw">Confirmer le nouveau mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="profil-confirm-pw"
                          type={showConfirmPw ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowConfirmPw((v) => !v)}
                          aria-label={showConfirmPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={isPwSaving}
                    >
                      {isPwSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="mr-2 h-4 w-4" />
                      )}
                      Mettre à jour le mot de passe
                    </Button>
                  </form>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
