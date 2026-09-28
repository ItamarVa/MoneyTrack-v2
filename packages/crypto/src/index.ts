export {
  APP_TERMS,
  checkPassword,
  denylistSize,
  isCommonPassword,
  type PasswordCheck,
  type PasswordRejection,
} from "./password-policy.js";

export {
  KEYSLOT_FILE_VERSION,
  type KeyslotEntry,
  type KeyslotFile,
  type KeyslotKind,
  type KeyslotSaltB64,
  type WrappedDbKeyB64,
} from "./keyslots.js";

export { decrypt, encrypt, generateKey } from "./symmetric.js";

export {
  ARGON2_KEK_OPTIONS,
  KEYSLOTS_FILENAME,
  KeyslotUnlockError,
  RECOVERY_SLOT_USER_ID,
  addPassphraseSlotToFile,
  createInitialKeyslotFile,
  createPassphraseSlot,
  createRecoverySlot,
  deriveSlotKek,
  findPassphraseSlot,
  findRecoverySlot,
  generateKeyslotSalt,
  generateRecoveryKey,
  unwrapKeyslotEntry,
} from "./keyslot-custody.js";

export { readKeyslotFile, resolveKeyslotPath, writeKeyslotFile } from "./keyslot-file.js";
