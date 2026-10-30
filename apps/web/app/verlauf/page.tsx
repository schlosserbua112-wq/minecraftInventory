import { redirect } from "next/navigation";

// Alte Adresse: der Verlauf ist den Projekten gewichen
export default function OldHistoryPage() {
  redirect("/projekte");
}
