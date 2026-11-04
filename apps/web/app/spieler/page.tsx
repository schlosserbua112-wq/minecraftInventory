import { redirect } from "next/navigation";

// Alte Adresse: Spieler steht jetzt in der Suche unter „Nach Spieler“
export default function OldPlayersPage() {
  redirect("/?modus=spieler");
}
