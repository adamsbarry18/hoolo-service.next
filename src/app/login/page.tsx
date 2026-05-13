"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { Loader2, Send, Eye, EyeOff } from "lucide-react";
import { BRAND_LOGO_MARK } from "@/lib/brand-assets";
import { useAuth } from "@/firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getAuthErrorFeedback } from "@/lib/user-facing-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (error: unknown) {
      const feedback = getAuthErrorFeedback(error, "signIn");
      toast({
        variant: feedback.variant ?? "destructive",
        title: feedback.title,
        description: feedback.description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    
    setIsResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      toast({
        title: "E-mail envoyé",
        description: "Un lien de réinitialisation a été envoyé à votre adresse e-mail.",
      });
      setIsResetDialogOpen(false);
      setResetEmail("");
    } catch (error: unknown) {
      const feedback = getAuthErrorFeedback(error, "passwordReset");
      toast({
        variant: feedback.variant ?? "destructive",
        title: feedback.title,
        description: feedback.description,
      });
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full flex-1 items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
        <Card className="shadow-2xl border-primary/10">
          <CardHeader className="space-y-2 text-center pb-8">
            <div className="mb-4 flex justify-center">
              <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
                <Image
                  src={BRAND_LOGO_MARK}
                  alt="Hoolo Service"
                  width={80}
                  height={80}
                  className="object-contain"
                />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-primary">Hoolo Service</CardTitle>
            <CardDescription className="text-base">
              Accédez à votre espace de gestion commerciale
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="votre-email@gmail.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                      <button 
                        type="button" 
                        className="text-xs font-medium text-primary hover:underline underline-offset-4"
                      >
                        Mot de passe oublié ?
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                        <DialogDescription>
                          Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleResetPassword} className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Votre e-mail</Label>
                          <Input 
                            id="reset-email" 
                            type="email" 
                            placeholder="votre-email@gmail.com" 
                            required 
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                          />
                        </div>
                        <DialogFooter>
                          <Button 
                            type="submit" 
                            disabled={isResetLoading}
                            className="w-full"
                          >
                            {isResetLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            Envoyer le lien
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-4 flex flex-col gap-4">
              <Button className="w-full h-11 text-base font-semibold" type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Se connecter
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                En cas de difficulté persistante, contactez l'administrateur.
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
