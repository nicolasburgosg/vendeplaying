import type { AppFormState } from "@/lib/form-state";

export function FormStateMessage({ state }: { state: AppFormState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`mt-4 rounded-[1rem] px-4 py-3 text-sm leading-6 ${
        state.status === "success"
          ? "border border-success/20 bg-success/10 text-success"
          : "border border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}
