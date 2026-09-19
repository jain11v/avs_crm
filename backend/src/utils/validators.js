// Format rules for common Indian identity/contact fields.
// Each validator returns null when the value passes (or is empty/absent —
// these fields are optional; use a separate "required" check if a field
// must be present), or a human-readable error message when it fails.

const PATTERNS = {
  phone: /^[6-9][0-9]{9}$/, // 10 digits, Indian mobile numbers start 6-9
  aadhar: /^[0-9]{12}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
};

const MESSAGES = {
  phone: 'Phone number must be exactly 10 digits, starting with 6-9 (e.g. 9876543210).',
  aadhar: 'Aadhar number must be exactly 12 digits, no spaces (e.g. 234567890123).',
  pan: 'PAN must be 10 characters in the format AAAAA9999A (e.g. ABCDE1234F).',
  gst: 'GST number must be a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5).',
};

// Validates a set of fields against the patterns above. Only checks fields
// that are actually present (non-null, non-empty) in `data` — doesn't
// enforce that they exist at all.
//
// Returns an array of error message strings — empty array means everything
// passed.
function validateFormats(data) {
  const errors = [];

  for (const field of Object.keys(PATTERNS)) {
    const value = data[field];
    if (value === undefined || value === null || value === '') continue;

    if (!PATTERNS[field].test(value)) {
      errors.push(MESSAGES[field]);
    }
  }

  return errors;
}

// Normalizes values before they're stored: PAN/GST are conventionally
// uppercase, and phone numbers sometimes come in with spaces/dashes from
// copy-pasting — strip those before validating/storing.
function normalizeFormats(data) {
  const out = { ...data };
  if (out.pan) out.pan = out.pan.toUpperCase().trim();
  if (out.gst) out.gst = out.gst.toUpperCase().trim();
  if (out.phone) out.phone = out.phone.replace(/[\s-]/g, '');
  if (out.aadhar) out.aadhar = out.aadhar.replace(/[\s-]/g, '');
  return out;
}

module.exports = { validateFormats, normalizeFormats, PATTERNS, MESSAGES };
