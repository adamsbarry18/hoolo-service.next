"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { useFirestore, useUser } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getAuthForAdminUserCreation } from "@/firebase/secondary-auth-app";
import { useToast } from "@/hooks/use-toast";
import { getAuthErrorFeedback, toUserFacingErrorMessage } from "@/lib/user-facing-error";

function buildDisplayName(firstName: string, lastName: string, email: string): string {
  const full = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (full) return full;
  return email.trim().split("@")[0] || "";
}

export default function NewUserPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { profile } = useUser();
  const { toast } = useToast();
  const [formEl, setFormEl] = useState<HTMLFormElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    role: "Vendeur",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;
    setIsSubmitting(true);

    try {
      if (formData.password.length < 6) {
        toast({
          variant: "destructive",
          title: "Mot de passe trop court",
          description: "Le mot de passe doit contenir au moins 6 caractères.",
        });
        return;
      }

      const displayName = buildDisplayName(
        formData.firstName,
        formData.lastName,
        formData.email
      );
      const payload = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        displayName,
        role: formData.role,
      };

      const secondaryAuth = getAuthForAdminUserCreation();
      let uid: string;
      try {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          formData.email.trim(),
          formData.password
        );
        uid = cred.user.uid;
      } catch (authErr: unknown) {
        const feedback = getAuthErrorFeedback(authErr, "createUser");
        toast({
          variant: feedback.variant ?? "destructive",
          title: feedback.title,
          description: feedback.description,
        });
        return;
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }

      await setDoc(doc(firestore, "users", uid), {
        ...payload,
        id: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Utilisateur créé",
        description:
          "Compte et profil enregistrés. La personne peut se connecter avec cet e-mail et ce mot de passe.",
      });
      router.push("/users");
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: toUserFacingErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profile?.role !== "Admin") {
    return (
      <AppLayout>
        <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 text-center">
          <Shield size={48} className="text-rose-500" />
          <h2 className="text-2xl font-bold">Accès restreint</h2>
          <p className="text-muted-foreground">
            Seuls les administrateurs peuvent créer des utilisateurs.
          </p>
          <Button asChild variant="outline">
            <Link href="/users">Retour à la liste</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
            <Link href="/users">
              <ArrowLeft className="h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Nouvel utilisateur</CardTitle>
            <CardDescription className="text-pretty">
              Création du compte (e-mail et mot de passe) et du profil dans l’application. Après validation, vous êtes
              renvoyé vers la liste du personnel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={setFormEl} onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nu-firstName">Prénom</Label>
                  <Input
                    id="nu-firstName"
                    required
                    autoComplete="given-name"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nu-lastName">Nom</Label>
                  <Input
                    id="nu-lastName"
                    required
                    autoComplete="family-name"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nu-phone">Téléphone (optionnel)</Label>
                <Input
                  id="nu-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+224 …"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nu-email">E-mail</Label>
                <Input
                  id="nu-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nu-password">Mot de passe initial</Label>
                <div className="relative">
                  <Input
                    id="nu-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum 6 caractères. À communiquer une seule fois à l’employé ; il pourra utiliser «
                  mot de passe oublié » après la première connexion.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select
                  value={formData.role}
                  onValueChange={(val) => setFormData({ ...formData, role: val })}
                >
                  <SelectTrigger id="nu-role">
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent container={formEl} className="z-[200]">
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Vendeur">Vendeur</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Le magasin actif se choisit dans l’en-tête pour chaque utilisateur.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild disabled={isSubmitting}>
                  <Link href="/users">Annuler</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Créer l’utilisateur
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
