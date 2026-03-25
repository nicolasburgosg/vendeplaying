export function IllustrationSlot({
  width,
  height,
  label,
  className = "",
}: {
  width: number;
  height: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border-2 border-dashed border-line ${className}`.trim()}
      style={{ width, height, maxWidth: "100%" }}
    >
      <span className="text-xs font-medium text-muted/60 select-none">
        {label}
      </span>
    </div>
  );
}
