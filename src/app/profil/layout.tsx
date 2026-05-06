import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mon profil | Hoolo Service",
  description: "Modifier vos informations personnelles et votre contact.",
};

export default function ProfilLayout({ children }: { children: React.ReactNode }) {
  return children;
}
