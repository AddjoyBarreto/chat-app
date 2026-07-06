import {
  Direction,
  type KeyPairType,
  type SessionRecordType,
  type StorageType,
} from "@privacyresearch/libsignal-protocol-typescript";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./buffers.js";

export interface SerializedKeyPair {
  pubKey: string;
  privKey: string;
}

export interface SerializedStoreState {
  identityKeyPair?: SerializedKeyPair;
  localRegistrationId?: number;
  preKeys: Record<string, SerializedKeyPair>;
  signedPreKeys: Record<string, SerializedKeyPair>;
  sessions: Record<string, SessionRecordType>;
  trustedIdentities: Record<string, string>;
}

/**
 * In-memory Signal Protocol store for a single device.
 * Private keys never leave this object — in production, back with secure storage.
 */
export class SignalProtocolStore implements StorageType {
  private identityKeyPair?: KeyPairType;
  private localRegistrationId?: number;
  private preKeys = new Map<string, KeyPairType>();
  private signedPreKeys = new Map<string, KeyPairType>();
  private sessions = new Map<string, SessionRecordType>();
  private trustedIdentities = new Map<string, ArrayBuffer>();

  setIdentityKeyPair(keyPair: KeyPairType): void {
    this.identityKeyPair = keyPair;
  }

  setLocalRegistrationId(id: number): void {
    this.localRegistrationId = id;
  }

  exportState(): SerializedStoreState {
    const serializeKeyPair = (kp: KeyPairType): SerializedKeyPair => ({
      pubKey: arrayBufferToBase64(kp.pubKey),
      privKey: arrayBufferToBase64(kp.privKey),
    });

    const preKeys: Record<string, SerializedKeyPair> = {};
    for (const [id, kp] of this.preKeys) preKeys[id] = serializeKeyPair(kp);

    const signedPreKeys: Record<string, SerializedKeyPair> = {};
    for (const [id, kp] of this.signedPreKeys) signedPreKeys[id] = serializeKeyPair(kp);

    const sessions: Record<string, SessionRecordType> = {};
    for (const [id, rec] of this.sessions) sessions[id] = rec;

    const trustedIdentities: Record<string, string> = {};
    for (const [id, key] of this.trustedIdentities) {
      trustedIdentities[id] = arrayBufferToBase64(key);
    }

    return {
      identityKeyPair: this.identityKeyPair ? serializeKeyPair(this.identityKeyPair) : undefined,
      localRegistrationId: this.localRegistrationId,
      preKeys,
      signedPreKeys,
      sessions,
      trustedIdentities,
    };
  }

  importState(state: SerializedStoreState): void {
    const deserializeKeyPair = (kp: SerializedKeyPair): KeyPairType => ({
      pubKey: base64ToArrayBuffer(kp.pubKey),
      privKey: base64ToArrayBuffer(kp.privKey),
    });

    if (state.identityKeyPair) this.identityKeyPair = deserializeKeyPair(state.identityKeyPair);
    if (state.localRegistrationId !== undefined) this.localRegistrationId = state.localRegistrationId;

    this.preKeys.clear();
    for (const [id, kp] of Object.entries(state.preKeys)) {
      this.preKeys.set(id, deserializeKeyPair(kp));
    }

    this.signedPreKeys.clear();
    for (const [id, kp] of Object.entries(state.signedPreKeys)) {
      this.signedPreKeys.set(id, deserializeKeyPair(kp));
    }

    this.sessions.clear();
    for (const [id, rec] of Object.entries(state.sessions)) {
      this.sessions.set(id, rec);
    }

    this.trustedIdentities.clear();
    for (const [id, key] of Object.entries(state.trustedIdentities)) {
      this.trustedIdentities.set(id, base64ToArrayBuffer(key));
    }
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.localRegistrationId;
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    const existing = this.trustedIdentities.get(identifier);
    if (!existing) return true;
    return Buffer.from(existing).equals(Buffer.from(identityKey));
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean
  ): Promise<boolean> {
    const existing = this.trustedIdentities.get(encodedAddress);
    if (existing && !Buffer.from(existing).equals(Buffer.from(publicKey))) {
      return false;
    }
    this.trustedIdentities.set(encodedAddress, publicKey);
    return true;
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    return this.preKeys.get(String(keyId));
  }

  async storePreKey(keyId: string | number, keyPair: KeyPairType): Promise<void> {
    this.preKeys.set(String(keyId), keyPair);
  }

  async removePreKey(keyId: string | number): Promise<void> {
    this.preKeys.delete(String(keyId));
  }

  async loadSignedPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    return this.signedPreKeys.get(String(keyId));
  }

  async storeSignedPreKey(keyId: string | number, keyPair: KeyPairType): Promise<void> {
    this.signedPreKeys.set(String(keyId), keyPair);
  }

  async removeSignedPreKey(keyId: string | number): Promise<void> {
    this.signedPreKeys.delete(String(keyId));
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return this.sessions.get(encodedAddress);
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    this.sessions.set(encodedAddress, record);
  }

  async removeSession(encodedAddress: string): Promise<void> {
    this.sessions.delete(encodedAddress);
  }

  clearSessions(): void {
    this.sessions.clear();
  }
}
