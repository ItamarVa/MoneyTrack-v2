/**
 * Live checklist for the HA master passphrase on the enroll and recovery pages,
 * plus the Hebrew text for the server's rejection codes. The rule lives in
 * @moneytrack/contracts; the server re-checks it and adds the common-password
 * denylist, so this is guidance for the user, never the gate (ADR-008).
 * Copy comes from locales/he.json: no Hebrew in source files. Users see
 * "master password"; code, API fields and error codes keep "passphrase".
 */
import {
  HA_PASSPHRASE_MAX_LENGTH,
  HA_PASSPHRASE_MIN_LENGTH,
  HA_PASSPHRASE_REQUIREMENTS,
  missingHaPassphraseRequirements,
} from "@moneytrack/contracts";
import { Check, X } from "lucide-react";
import he from "@/locales/he.json";

const copy = he.haPassphrase;

function fill(text: string): string {
  return text
    .replace("{min}", String(HA_PASSPHRASE_MIN_LENGTH))
    .replace("{max}", String(HA_PASSPHRASE_MAX_LENGTH));
}

/** Hebrew message for a passphrase rejection code, or null for any other code. */
export function haPassphraseErrorMessage(code: string | undefined): string | null {
  const message = code ? (copy.errors as Record<string, string>)[code] : undefined;
  return message ? fill(message) : null;
}

/** Client-side pre-check with the same rule the server enforces; null when it passes. */
export function haPassphraseClientError(passphrase: string): string | null {
  const missing = missingHaPassphraseRequirements(passphrase);
  if (missing.length === 0) {
    return null;
  }
  return haPassphraseErrorMessage(missing.includes("length") ? "passphrase_too_short" : "passphrase_missing_classes");
}

export function HaPassphraseChecklist({ id, passphrase }: { id: string; passphrase: string }) {
  const missing = new Set(missingHaPassphraseRequirements(passphrase));
  return (
    <div id={id} className="text-sm">
      <p className="text-text-secondary">{copy.checklistTitle}</p>
      <ul className="mt-1 space-y-1">
        {HA_PASSPHRASE_REQUIREMENTS.map((requirement) => {
          const met = !missing.has(requirement);
          const Icon = met ? Check : X;
          return (
            <li
              key={requirement}
              className={`flex items-center gap-2 ${met ? "text-green-700 dark:text-green-400" : "text-text-muted"}`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{fill(copy.requirement[requirement])}</span>
              <span className="sr-only">{met ? copy.met : copy.unmet}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
