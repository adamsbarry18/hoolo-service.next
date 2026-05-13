"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc } from "firebase/firestore";
import { collection, orderBy, query } from "firebase/firestore";
import { ArrowLeft, FileText, Loader2, Wrench } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RepairDetailView, type RepairDetailRow } from "@/components/repairs/repair-detail-view";
import { REPAIR_STATUS_LABELS } from "@/components/repairs/repair-status-labels";
import { useToast } from "@/hooks/use-toast";
import { useBoutiqueScope } from "@/contexts/boutique-scope";
import { useFirestore, useCollection, useDoc, useMemoFirebase } from "@/firebase";
import { updateRepairStatus, type RepairStatus } from "@/firebase/services/repair-service";
import { generatePDF, type PDFData } from "@/lib/pdf-service";
import { toUserFacingErrorMessage } from "@/lib/user-facing-error";

export default function RepairDetailPage() {
  const params = useParams();
  const repairId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] ?? "" : "";

  const router = useRouter();
  const firestore = useFirestore();
  const { activeBoutiqueId: boutiqueId } = useBoutiqueScope();
  const { toast } = useToast();

  const repairRef = useMemoFirebase(() => {
    if (!firestore || !boutiqueId || !repairId) return null;
    return doc(firestore, "boutiques", boutiqueId, "repairs", repairId);
  }, [firestore, boutiqueId, repairId]);

  const { data: repair, isLoading: repairLoading, error: repairError } = useDoc(repairRef);

  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, "products"), orderBy("name", "asc"));
  }, [firestore]);

  const stocksQuery = useMemoFirebase(() => {
    if (!firestore || !boutiqueId) return null;
    return query(collection(firestore, "boutiques", boutiqueId, "stocks"));
  }, [firestore, boutiqueId]);

  const { data: products } = useCollection(productsQuery);
  const { data: stocks } = useCollection(stocksQuery);

  const row = useMemo((): RepairDetailRow | null => {
    if (!repair?.id) return null;
    return repair as RepairDetailRow;
  }, [repair]);

  const handleStatusChange = async (id: string, status: RepairStatus) => {
    if (!boutiqueId) return;
    try {
      await updateRepairStatus(firestore, boutiqueId, id, status);
      toast({
        title: "Statut mis à jour",
        description: `Étape : ${REPAIR_STATUS_LABELS[status].label}`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Mise à jour impossible",
        description: toUserFacingErrorMessage(error),
      });
      throw error;
    }
  };

  const handlePrint = (r: RepairDetailRow) => {
    const pdfData: PDFData = {
      title: "Fiche réparation",
      id: r.id.substring(0, 8).toUpperCase(),
      date: new Date().toLocaleDateString("fr-FR"),
      clientName: r.customerName ?? "",
      clientPhone: r.phoneNumber,
      boutiqueName: boutiqueId ? `Boutique ${boutiqueId}` : "Hoolo Service",
      items: [
        {
          description: `Réparation ${r.deviceType ?? ""} ${r.deviceBrand ?? ""} ${r.deviceModel ?? ""} - ${r.issueDescription ?? ""}`,
          quantity: 1,
          unitPrice: r.laborCost ?? 0,
          total: r.laborCost ?? 0,
        },
      ],
      totalAmount: r.totalCost ?? r.laborCost ?? 0,
      notes: [
        `Pièces (estimé dossier) : ${(r.partsCost ?? 0).toLocaleString()} GNF`,
        `IMEI/SN : ${r.serialNumber || "N/A"}`,
        `Statut : ${REPAIR_STATUS_LABELS[r.status as RepairStatus]?.label ?? r.status}`,
        r.internalNotes ? `Notes atelier : ${r.internalNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    generatePDF(pdfData);
  };

  if (!boutiqueId) {
    return (
      <AppLayout>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench /> Fiche réparation
            </CardTitle>
            <CardDescription>
              Choisissez un magasin dans le menu « Boutique active », puis revenez sur cette fiche.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppLayout>
    );
  }

  if (!repairId) {
    return (
      <AppLayout>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Identifiant manquant</CardTitle>
            <CardDescription>
              <Button variant="link" className="h-auto p-0" asChild>
                <Link href="/repairs">Retour à la liste</Link>
              </Button>
            </CardDescription>
          </CardHeader>
        </Card>
      </AppLayout>
    );
  }

  if (repairLoading) {
    return (
      <AppLayout>
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Chargement de la fiche…</p>
        </div>
      </AppLayout>
    );
  }

  if (repairError || !row) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" type="button" onClick={() => router.push("/repairs")}>
            <ArrowLeft className="h-4 w-4" /> Retour à l’atelier
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>Fiche introuvable</CardTitle>
                <CardDescription>
                  {repairError ? toUserFacingErrorMessage(repairError) : "Ce dossier n’existe pas ou n’est plus disponible."}
                </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" type="button" asChild>
            <Link href="/repairs">
              <ArrowLeft className="h-4 w-4" /> Retour à l’atelier
            </Link>
          </Button>
          <Button variant="outline" size="sm" type="button" className="w-fit" onClick={() => handlePrint(row)}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
        <RepairDetailView
          repair={row}
          boutiqueId={boutiqueId}
          products={products ?? undefined}
          stocks={stocks ?? undefined}
          statusMap={REPAIR_STATUS_LABELS}
          onStatusChange={handleStatusChange}
        />
      </div>
    </AppLayout>
  );
}
