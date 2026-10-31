import { redirect } from "next/navigation";

// Alte Adresse: Spieler heißt jetzt Inventare
export default function OldPlayersPage() {
  redirect("/inventare");
}
