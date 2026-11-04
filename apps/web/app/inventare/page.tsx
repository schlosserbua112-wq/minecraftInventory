import { redirect } from "next/navigation";

// Alte Adresse: „Wer hat was?“ ist in der Suche unter „Nach Spieler“ aufgegangen
export default function OldInventoriesPage() {
  redirect("/?modus=spieler");
}
