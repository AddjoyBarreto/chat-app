import type { MessageEnvelope } from "@vaultchat/protocol";
import type { ReadStateManager } from "./read-state.js";

/** Tracks processed envelope IDs and unread eligibility for direct messages. */
export class MessageInbox {
  private readonly processedIds = new Set<string>();

  hasProcessed(envelopeId: string): boolean {
    return this.processedIds.has(envelopeId);
  }

  markProcessed(envelopeId: string): void {
    this.processedIds.add(envelopeId);
  }

  clearProcessed(): void {
    this.processedIds.clear();
  }

  peerIdForEnvelope(envelope: MessageEnvelope, selfUserId: string): string {
    return envelope.senderId === selfUserId ? envelope.recipientId : envelope.senderId;
  }

  shouldIncrementUnread(
    envelope: MessageEnvelope,
    selfUserId: string,
    readState: ReadStateManager,
    opts: {
      isViewingPeer: boolean;
      decryptFailed: boolean;
    }
  ): boolean {
    if (opts.isViewingPeer) return false;
    if (envelope.senderId === selfUserId) return false;
    if (opts.decryptFailed) return false;
    const peerId = this.peerIdForEnvelope(envelope, selfUserId);
    return !readState.isPeerMessageRead(peerId, envelope.createdAt);
  }
}
