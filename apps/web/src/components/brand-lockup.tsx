import Link from "next/link";

export function BrandLockup({
  href = "/",
  subtitle,
  className = "",
}: {
  href?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex items-center ${className}`.trim()}>
      <div>
        <p className="text-xl font-bold tracking-tight text-foreground">
          VendeTo&apos;
        </p>
        {subtitle ? (
          <p className="text-xs text-muted">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}
