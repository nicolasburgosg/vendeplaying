import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground lg:px-10">
      <div className="mx-auto max-w-2xl border-t border-line py-8">
        <p className="font-mono text-sm uppercase tracking-[0.28em] text-accent-strong">
          Error de acceso
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          No pudimos completar la autenticación.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          El enlace pudo expirar o la sesión no se pudo confirmar correctamente.
          Intenta entrar de nuevo, pedir otro enlace o crear otra vez tu cuenta.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            Ir a login
          </Link>
          <Link
            href="/registro"
            className="site-button-secondary"
          >
            Volver a registro
          </Link>
          <Link
            href="/recuperar-contrasena"
            className="site-button-secondary"
          >
            Recuperar contraseña
          </Link>
        </div>
      </div>
    </main>
  );
}
