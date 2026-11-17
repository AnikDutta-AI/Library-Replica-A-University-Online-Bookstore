import { redirect } from "next/navigation";

/**
 * Fallback only: next.config.ts rewrites "/" to the static LibraryReplica
 * landing page (public/index.html). If the rewrite is ever bypassed we redirect.
 */
export default function HomePage() {
  redirect("/index.html");
}
