import { redirect } from "next/navigation";

// Alte Adresse: „Meine Items“ heißt jetzt „Meine Kisten“, Inventar und Enderkiste stehen in der Suche
export default function OldMyItemsPage() {
  redirect("/meine-kisten");
}
