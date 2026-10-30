import { redirect } from "next/navigation";

// Alte Adresse: Spieler heißt jetzt „Wer hat was?“
export default function OldPlayersPage() {
  redirect("/inventare");
}
