import type { RepairStatus } from "@/firebase/services/repair-service";

export const REPAIR_STATUS_LABELS: Record<RepairStatus, { label: string; color: string }> = {
  reçu: { label: "Reçu", color: "bg-slate-100 text-slate-700" },
  en_diagnostic: { label: "Diagnostic", color: "bg-orange-100 text-orange-700" },
  devis_envoyé: { label: "Devis envoyé", color: "bg-blue-100 text-blue-700" },
  en_cours: { label: "En réparation", color: "bg-indigo-100 text-indigo-700" },
  terminé: { label: "Terminé", color: "bg-emerald-100 text-emerald-700" },
  prêt_à_retirer: { label: "Prêt à retirer", color: "bg-emerald-500 text-white" },
  retiré: { label: "Retiré", color: "bg-gray-100 text-gray-500" },
  annulé: { label: "Annulé", color: "bg-rose-100 text-rose-700" },
};
