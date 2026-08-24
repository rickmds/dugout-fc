// Display-only formatter — (xxx) xxx-xxxx for a 10-digit US number. Never
// use this on a value headed into a `tel:`/`sms:` link; those need raw
// digits, not the punctuated display string.
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
