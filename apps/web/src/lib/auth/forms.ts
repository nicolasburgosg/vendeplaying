export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields: {
    email?: string;
    fullName?: string;
    organizationName?: string;
  };
};

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  status: "idle",
  fields: {},
};

export function normalizeEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function validatePassword(password: string) {
  return password.length >= 8;
}
