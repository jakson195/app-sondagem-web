import { redirect } from "next/navigation";

/** Validação RTK foi retirada do produto; bookmarks antigos vão para o CAD. */
export default function DigitalTwinGnssRtkPage() {
  redirect("/cad");
}
