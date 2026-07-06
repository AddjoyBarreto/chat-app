import type { CountryCode } from "libphonenumber-js";
import { isValidPhoneNumber } from "libphonenumber-js";
import { getCountryDialCode } from "./countries";

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

export interface RegistrationFields {
  username: string;
  email: string;
  password: string;
  phoneCountry: string;
  phoneNumber: string;
}

export type RegistrationFieldErrors = {
  username?: string;
  email?: string;
  password?: string;
  phoneCountry?: string;
  phoneNumber?: string;
  form?: string;
};

export type LoginFieldErrors = {
  identifier?: string;
  password?: string;
  form?: string;
};

export function hasFieldErrors(errors: RegistrationFieldErrors | LoginFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateUsername(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return "Username is required.";
  if (!USERNAME_RE.test(normalized)) {
    return "3–32 characters: letters, numbers, underscore only.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "Email is required.";
  if (!EMAIL_RE.test(normalized)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < MIN_PASSWORD_LEN) return "Password must be at least 8 characters.";
  return null;
}

export function validatePhone(countryIso: string, phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) return "Phone number is required.";
  if (!countryIso) return "Select a country.";

  try {
    if (!isValidPhoneNumber(digits, countryIso as CountryCode)) {
      return "Enter a valid phone number for the selected country.";
    }
  } catch {
    return "Enter a valid phone number for the selected country.";
  }
  return null;
}

export function validateRegistrationFields(fields: RegistrationFields): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  const usernameErr = validateUsername(fields.username);
  if (usernameErr) errors.username = usernameErr;
  const emailErr = validateEmail(fields.email);
  if (emailErr) errors.email = emailErr;
  const passwordErr = validatePassword(fields.password);
  if (passwordErr) errors.password = passwordErr;
  const phoneErr = validatePhone(fields.phoneCountry, fields.phoneNumber);
  if (phoneErr) errors.phoneNumber = phoneErr;
  return errors;
}

export interface NormalizedRegistrationFields {
  username: string;
  email: string;
  password: string;
  phoneCountry: string;
  phoneCountryCode: string;
  phoneNumber: string;
}

export function normalizeRegistrationFields(fields: RegistrationFields): NormalizedRegistrationFields {
  return {
    username: fields.username.trim().toLowerCase(),
    email: fields.email.trim().toLowerCase(),
    password: fields.password,
    phoneCountry: fields.phoneCountry,
    phoneCountryCode: getCountryDialCode(fields.phoneCountry),
    phoneNumber: fields.phoneNumber.replace(/\D/g, ""),
  };
}
