import { StatusPill } from "@/components/status-pill";
import { readinessTone, type ReadinessReport, type ReadinessState } from "@/lib/readiness";

function itemTone(state: ReadinessState) {
  return readinessTone(state);
}

export function ReadinessPanel({
  readiness,
  compact = false,
}: {
  readiness: ReadinessReport;
  compact?: boolean;
}) {
  const items = [
    {
      label: "WhatsApp",
      value: readiness.whatsapp,
    },
    {
      label: "Pagos",
      value: readiness.payments,
    },
    {
      label: "IA",
      value: readiness.ai,
    },
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <StatusPill key={item.label} tone={itemTone(item.value.state)}>
            {item.label}: {item.value.label}
          </StatusPill>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 border-t border-line pt-6 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{item.label}</p>
            <StatusPill tone={itemTone(item.value.state)}>{item.value.label}</StatusPill>
          </div>
          <p className="text-sm leading-7 text-muted">{item.value.detail}</p>
          {item.value.blockers.length > 0 ? (
            <ul className="site-list text-sm leading-7 text-muted">
              {item.value.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="site-note">Sin bloqueos detectados para este módulo.</p>
          )}
        </div>
      ))}
    </div>
  );
}
