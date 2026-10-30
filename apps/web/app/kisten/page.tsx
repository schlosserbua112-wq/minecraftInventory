"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Die unbenannten Kisten ordnet man jetzt direkt in der Suche zu; alte Links landen dort. */
export default function UnnamedChestsRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
