"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { DecodeHintType, NotFoundException } from "@zxing/library";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const MAX_REF_LEN = 500;

function buildHints() {
  const hints = new Map<DecodeHintType, BarcodeFormat[]>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
    BarcodeFormat.PDF_417,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODABAR,
    BarcodeFormat.ITF,
  ]);
  return hints;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texte brut lu sur le code (EAN, QR, etc.) - sera tronqué pour la référence. */
  onDecoded: (text: string) => void;
};

export function ProductBarcodeScannerDialog({ open, onOpenChange, onDecoded }: Props) {
  const { toast } = useToast();
  const hints = useMemo(() => buildHints(), []);
  const videoId = useMemo(() => `pc-barcode-v-${Math.random().toString(36).slice(2, 12)}`, []);
  const [starting, setStarting] = useState(false);
  const onDecodedRef = useRef(onDecoded);
  const onOpenChangeRef = useRef(onOpenChange);
  onDecodedRef.current = onDecoded;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) {
      setStarting(false);
      return;
    }

    setStarting(true);
    const reader = new BrowserMultiFormatReader(hints);
    let alive = true;
    let controls: IScannerControls | null = null;

    const cleanup = () => {
      alive = false;
      try {
        controls?.stop();
      } catch {
        /* ignore */
      }
      controls = null;
    };

    (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (!alive) return;

      if (typeof document !== "undefined" && !document.getElementById(videoId)) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (!alive) return;

      try {
        controls = await reader.decodeFromVideoDevice(undefined, videoId, (result, err, c) => {
          if (!alive) return;
          if (result) {
            const text = result.getText().trim();
            if (text) {
              alive = false;
              try {
                c.stop();
              } catch {
                /* ignore */
              }
              controls = null;
              onDecodedRef.current(text.slice(0, MAX_REF_LEN));
              onOpenChangeRef.current(false);
            }
            return;
          }
          if (err && !(err instanceof NotFoundException)) {
            console.warn("[barcode-scan]", err);
          }
        });
      } catch (e: unknown) {
        cleanup();
        const msg =
          e instanceof Error
            ? e.message
            : "Autorisez l’accès à la caméra dans les réglages du navigateur.";
        toast({
          variant: "destructive",
          title: "Caméra indisponible",
          description: msg,
        });
        onOpenChangeRef.current(false);
      } finally {
        setStarting(false);
      }
    })();

    return cleanup;
  }, [open, hints, videoId, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 top-0 flex max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none border-0 p-4 sm:left-[50%] sm:top-[50%] sm:max-h-[90vh] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:p-6">
        <DialogHeader>
          <DialogTitle>Scanner un code</DialogTitle>
          <DialogDescription>
            Code-barres (EAN, UPC, Code 128…) ou QR code. Le texte lu remplira le champ « Référence produit ».
          </DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-md bg-black">
          <video
            id={videoId}
            className="mx-auto aspect-[4/3] w-full object-cover sm:aspect-video sm:max-h-[min(50vh,360px)]"
            playsInline
            muted
            aria-label="Aperçu caméra pour lecture du code"
          />
          {starting ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
            </div>
          ) : null}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Placez le code dans le cadre et attendez la mise au point. Vous pouvez annuler pour revenir au formulaire.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
      </DialogContent>
    </Dialog>
  );
}
