import Link from "next/link";

/** Unknown routes: point visitors to the custom static 404 page. */
export default function NotFound() {
  return (
    <main style={{ fontFamily: "sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
      <meta httpEquiv="refresh" content="0; url=/404.html" />
      <h1>Page not found</h1>
      <p>
        <Link href="/404.html">Continue to LibraryReplica</Link>
      </p>
    </main>
  );
}
