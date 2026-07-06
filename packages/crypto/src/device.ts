import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type KeyPairType,
  type MessageType,
  type PreKeyType,
  type SignedPublicPreKeyType,
} from "@privacyresearch/libsignal-protocol-typescript";
import type {
  OneTimePreKeyPayload,
  PreKeyBundleResponse,
  SignedPreKeyPayload,
} from "@vaultchat/protocol";
import {
  arrayBufferToBase64,
  arrayBufferToBinaryString,
  arrayBufferToUtf8,
  base64ToArrayBuffer,
  binaryStringToArrayBuffer,
  utf8ToArrayBuffer,
} from "./buffers.js";
import { SignalProtocolStore, type SerializedStoreState } from "./store.js";

export interface VaultDeviceState {
  signedPreKeyId: number;
  signedPreKeySignature: string;
  preKeyIds: number[];
  store: SerializedStoreState;
}

export interface DeviceKeyMaterial {
  registrationId: number;
  identityKeyPublic: string;
  signedPreKey: SignedPreKeyPayload;
  oneTimePreKeys: OneTimePreKeyPayload[];
}

export interface EncryptedPayload {
  type: number;
  body: string;
  registrationId?: number;
  /** Present on messages encoded after the UTF-8 storage fix */
  bodyEncoding?: "base64";
}

export class VaultDevice {
  readonly store = new SignalProtocolStore();
  readonly userId: string;
  readonly deviceId: number;

  private signedPreKeyId?: number;
  private signedPreKeySignature?: ArrayBuffer;
  private preKeyIds: number[] = [];

  private constructor(userId: string, deviceId: number) {
    this.userId = userId;
    this.deviceId = deviceId;
  }

  static async create(userId: string, deviceId = 1): Promise<VaultDevice> {
    const device = new VaultDevice(userId, deviceId);
    await device.generateKeys();
    return device;
  }

  static async restore(userId: string, deviceId: number, state: VaultDeviceState): Promise<VaultDevice> {
    const device = new VaultDevice(userId, deviceId);
    device.signedPreKeyId = state.signedPreKeyId;
    device.signedPreKeySignature = base64ToArrayBuffer(state.signedPreKeySignature);
    device.preKeyIds = state.preKeyIds;
    device.store.importState(state.store);
    return device;
  }

  exportState(): VaultDeviceState {
    if (this.signedPreKeyId === undefined || !this.signedPreKeySignature) {
      throw new Error("Device keys not initialized");
    }
    return {
      signedPreKeyId: this.signedPreKeyId,
      signedPreKeySignature: arrayBufferToBase64(this.signedPreKeySignature),
      preKeyIds: this.preKeyIds,
      store: this.store.exportState(),
    };
  }

  private async generateKeys(oneTimePreKeyCount = 10): Promise<void> {
    const registrationId = KeyHelper.generateRegistrationId();
    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    this.store.setIdentityKeyPair(identityKeyPair);
    this.store.setLocalRegistrationId(registrationId);

    const signedPreKeyId = KeyHelper.generateRegistrationId();
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
    this.signedPreKeyId = signedPreKeyId;
    this.signedPreKeySignature = signedPreKey.signature;
    await this.store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    for (let i = 0; i < oneTimePreKeyCount; i++) {
      const preKeyId = KeyHelper.generateRegistrationId();
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      this.preKeyIds.push(preKeyId);
      await this.store.storePreKey(preKeyId, preKey.keyPair);
    }
  }

  /** Count one-time prekeys still in local store (used = removed on server fetch). */
  async countAvailablePreKeys(): Promise<number> {
    let count = 0;
    for (const id of this.preKeyIds) {
      if (await this.store.loadPreKey(id)) count++;
    }
    return count;
  }

  /** Generate fresh one-time prekeys for server upload when running low. */
  async replenishPreKeys(count = 10): Promise<OneTimePreKeyPayload[]> {
    const identity = await this.store.getIdentityKeyPair();
    if (!identity) throw new Error("Device keys not initialized");

    const newKeys: OneTimePreKeyPayload[] = [];
    for (let i = 0; i < count; i++) {
      const preKeyId = KeyHelper.generateRegistrationId();
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      this.preKeyIds.push(preKeyId);
      await this.store.storePreKey(preKeyId, preKey.keyPair);
      newKeys.push({
        keyId: preKeyId,
        publicKey: arrayBufferToBase64(preKey.keyPair.pubKey),
      });
    }
    return newKeys;
  }

  async exportKeyMaterial(): Promise<DeviceKeyMaterial> {
    const identity = await this.store.getIdentityKeyPair();
    const registrationId = await this.store.getLocalRegistrationId();
    if (
      !identity ||
      registrationId === undefined ||
      this.signedPreKeyId === undefined ||
      !this.signedPreKeySignature
    ) {
      throw new Error("Device keys not initialized");
    }

    const signed = await this.store.loadSignedPreKey(this.signedPreKeyId);
    if (!signed) throw new Error("Signed prekey missing");

    const oneTimePreKeys: OneTimePreKeyPayload[] = [];
    for (const keyId of this.preKeyIds) {
      const keyPair = await this.store.loadPreKey(keyId);
      if (keyPair) {
        oneTimePreKeys.push({
          keyId,
          publicKey: arrayBufferToBase64(keyPair.pubKey),
        });
      }
    }

    return {
      registrationId,
      identityKeyPublic: arrayBufferToBase64(identity.pubKey),
      signedPreKey: {
        keyId: this.signedPreKeyId,
        publicKey: arrayBufferToBase64(signed.pubKey),
        signature: arrayBufferToBase64(this.signedPreKeySignature),
      },
      oneTimePreKeys,
    };
  }

  static bundleFromKeyMaterial(
    userId: string,
    deviceId: number,
    material: DeviceKeyMaterial,
    oneTimePreKey?: OneTimePreKeyPayload
  ): PreKeyBundleResponse {
    return {
      userId,
      deviceId,
      registrationId: material.registrationId,
      identityKey: material.identityKeyPublic,
      signedPreKey: material.signedPreKey,
      oneTimePreKey,
    };
  }

  static toDeviceType(bundle: PreKeyBundleResponse): DeviceType {
    const signedPreKey: SignedPublicPreKeyType = {
      keyId: bundle.signedPreKey.keyId,
      publicKey: base64ToArrayBuffer(bundle.signedPreKey.publicKey),
      signature: base64ToArrayBuffer(bundle.signedPreKey.signature),
    };

    let preKey: PreKeyType | undefined;
    if (bundle.oneTimePreKey) {
      preKey = {
        keyId: bundle.oneTimePreKey.keyId,
        publicKey: base64ToArrayBuffer(bundle.oneTimePreKey.publicKey),
      };
    }

    return {
      identityKey: base64ToArrayBuffer(bundle.identityKey),
      signedPreKey,
      preKey,
      registrationId: bundle.registrationId,
    };
  }

  private addressFor(recipientId: string, recipientDeviceId: number): SignalProtocolAddress {
    return new SignalProtocolAddress(recipientId, recipientDeviceId);
  }

  async establishSession(bundle: PreKeyBundleResponse): Promise<void> {
    const address = this.addressFor(bundle.userId, bundle.deviceId);
    const builder = new SessionBuilder(this.store, address);
    await builder.processPreKey(VaultDevice.toDeviceType(bundle));
  }

  async resetSession(recipientId: string, recipientDeviceId: number): Promise<void> {
    const address = this.addressFor(recipientId, recipientDeviceId);
    await this.store.removeSession(address.toString());
  }

  clearSessions(): void {
    this.store.clearSessions();
  }

  async encrypt(
    recipientId: string,
    recipientDeviceId: number,
    plaintext: string,
    bundle?: PreKeyBundleResponse
  ): Promise<EncryptedPayload> {
    const address = this.addressFor(recipientId, recipientDeviceId);
    const cipher = new SessionCipher(this.store, address);

    if (bundle) {
      await this.resetSession(recipientId, recipientDeviceId);
      await this.establishSession(bundle);
    } else {
      const hasSession = await cipher.hasOpenSession();
      if (!hasSession) {
        throw new Error("No session and no prekey bundle provided");
      }
    }

    const ciphertext = await cipher.encrypt(utf8ToArrayBuffer(plaintext));
    return VaultDevice.messageToPayload(ciphertext);
  }

  async decrypt(
    senderId: string,
    senderDeviceId: number,
    payload: EncryptedPayload
  ): Promise<string> {
    const address = this.addressFor(senderId, senderDeviceId);
    const cipher = new SessionCipher(this.store, address);
    const message = VaultDevice.payloadToMessage(payload);

    const run = async (): Promise<string> => {
      let plaintext: ArrayBuffer;
      if (message.type === 3) {
        plaintext = await cipher.decryptPreKeyWhisperMessage(message.body!, "binary");
      } else if (message.type === 1) {
        plaintext = await cipher.decryptWhisperMessage(message.body!, "binary");
      } else {
        throw new Error(`Unknown message type: ${message.type}`);
      }
      return arrayBufferToUtf8(plaintext);
    };

    try {
      return await run();
    } catch (err) {
      if (message.type !== 1) throw err;
      await this.resetSession(senderId, senderDeviceId);
      return run();
    }
  }

  static messageToPayload(message: MessageType): EncryptedPayload {
    if (!message.body) throw new Error("Encrypted message missing body");
    return {
      type: message.type,
      body: arrayBufferToBase64(binaryStringToArrayBuffer(message.body)),
      bodyEncoding: "base64",
      registrationId: message.registrationId,
    };
  }

  static payloadToMessage(payload: EncryptedPayload): MessageType {
    const body = VaultDevice.decodePayloadBody(payload);
    return {
      type: payload.type,
      body,
      registrationId: payload.registrationId,
    };
  }

  private static decodePayloadBody(payload: EncryptedPayload): string {
    if (payload.bodyEncoding === "base64") {
      return arrayBufferToBinaryString(base64ToArrayBuffer(payload.body));
    }
    if (/^[A-Za-z0-9+/]+=*$/.test(payload.body) && payload.body.length >= 4) {
      return arrayBufferToBinaryString(base64ToArrayBuffer(payload.body));
    }
    return payload.body;
  }
}
