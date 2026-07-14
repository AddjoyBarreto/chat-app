import type {
  CallType,
  IceCandidatePayload,
  SessionDescriptionPayload,
  WsClientEvent,
  WsServerEvent,
} from "@vaultchat/protocol";
import { fetchIceServers } from "./ice.js";

export type CallPhase =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended";

export interface WebRtcAdapter {
  RTCPeerConnection: typeof RTCPeerConnection;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface CallSessionConfig {
  token: string;
  selfUserId: string;
  sendWs: (event: WsClientEvent) => boolean;
  onPhaseChange: (phase: CallPhase, callId: string | null) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onLocalStream?: (stream: MediaStream | null) => void;
  onError: (message: string) => void;
  webrtc?: WebRtcAdapter;
}

const DISCONNECT_GRACE_MS = 8_000;
/** Cap outbound video to limit TURN / asymmetric-link congestion. */
const VIDEO_MAX_BITRATE_BPS = 800_000;

const VIDEO_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 24 },
};

export class CallSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private phase: CallPhase = "idle";
  private callId: string | null = null;
  private peerId: string | null = null;
  private callType: CallType = "voice";
  private isCaller = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private seenIncomingCallIds = new Set<string>();
  private pcInitPromise: Promise<void> | null = null;
  private mediaPromise: Promise<void> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: CallSessionConfig) {}

  getPhase() {
    return this.phase;
  }

  getCallId() {
    return this.callId;
  }

  getLocalStream() {
    return this.localStream;
  }

  getPeerId() {
    return this.peerId;
  }

  getCallType() {
    return this.callType;
  }

  toggleMute(): boolean {
    const audio = this.localStream?.getAudioTracks()[0];
    if (!audio) return false;
    audio.enabled = !audio.enabled;
    return audio.enabled;
  }

  toggleCamera(): boolean {
    const video = this.localStream?.getVideoTracks()[0];
    if (!video) return false;
    video.enabled = !video.enabled;
    return video.enabled;
  }

  async startOutgoing(calleeId: string, callType: CallType) {
    if (this.phase !== "idle") throw new Error("Already in a call");
    this.isCaller = true;
    this.peerId = calleeId;
    this.callType = callType;
    this.callId = crypto.randomUUID();
    this.setPhase("outgoing", this.callId);

    const sent = this.config.sendWs({
      type: "call_invite",
      callId: this.callId,
      calleeId,
      callType,
    });

    if (!sent) {
      this.resetToIdle();
      throw new Error("Not connected — cannot place call");
    }
  }

  async acceptIncoming(callId: string, callerId: string, callType: CallType) {
    if (this.phase !== "idle" && this.phase !== "incoming") {
      throw new Error("Cannot accept call");
    }
    this.isCaller = false;
    this.callId = callId;
    this.peerId = callerId;
    this.callType = callType;
    this.setPhase("connecting", callId);

    if (!this.config.sendWs({ type: "call_accept", callId })) {
      this.config.onError("Not connected — call failed");
      this.cleanup("ended");
      throw new Error("Not connected");
    }

    try {
      await this.ensurePeerConnection();
      await this.attachLocalMedia(callType);
    } catch (err) {
      this.config.onError(this.mediaErrorMessage(err));
      void this.endCall();
    }
  }

  rejectIncoming(callId: string, reason?: string) {
    this.config.sendWs({ type: "call_reject", callId, reason });
    this.cleanup("ended");
  }

  async handleServerEvent(event: WsServerEvent) {
    try {
      await this.dispatchServerEvent(event);
    } catch (err) {
      this.config.onError(this.mediaErrorMessage(err, "Call connection failed"));
      void this.endCall();
    }
  }

  private mediaErrorMessage(err: unknown, fallback = "Failed to start call"): string {
    if (err instanceof Error && (err.name === "NotAllowedError" || /not allowed by the user agent/i.test(err.message))) {
      return "Microphone or camera access is required for calls";
    }
    if (err instanceof Error && err.name === "NotFoundError") {
      return "No microphone or camera found";
    }
    if (err instanceof Error && err.name === "NotReadableError") {
      return "Microphone or camera is already in use";
    }
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  async endCall() {
    if (this.callId) {
      this.config.sendWs({ type: "call_end", callId: this.callId });
    }
    this.cleanup("ended");
  }

  private async dispatchServerEvent(event: WsServerEvent) {
    switch (event.type) {
      case "call_incoming": {
        if (this.seenIncomingCallIds.has(event.callId)) return;
        this.seenIncomingCallIds.add(event.callId);

        if (this.phase === "incoming" && this.callId === event.callId) return;

        if (this.phase !== "idle") {
          this.config.sendWs({ type: "call_reject", callId: event.callId, reason: "busy" });
          return;
        }

        this.callId = event.callId;
        this.peerId = event.callerId;
        this.callType = event.callType;
        this.isCaller = false;
        this.setPhase("incoming", event.callId);
        break;
      }

      case "call_accepted":
        if (!this.callId || event.callId !== this.callId) return;
        this.setPhase("connecting", this.callId);
        await this.ensurePeerConnection();
        await this.attachLocalMedia(this.callType);
        await this.createAndSendOffer();
        break;

      case "call_rejected":
        if (event.callId !== this.callId) return;
        this.config.onError(
          event.reason === "busy" ? "User is busy" : (event.reason ?? "Call declined")
        );
        this.cleanup("ended");
        break;

      case "call_offer":
        if (event.callId !== this.callId) return;
        await this.ensurePeerConnection();
        if (!this.localStream) await this.attachLocalMedia(this.callType);
        await this.pc!.setRemoteDescription(event.sdp);
        await this.flushPendingIce();
        {
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          await this.applyVideoBitrateCap();
          this.config.sendWs({
            type: "call_answer",
            callId: event.callId,
            sdp: answer as SessionDescriptionPayload,
          });
        }
        break;

      case "call_answer":
        if (event.callId !== this.callId || !this.pc) return;
        await this.pc.setRemoteDescription(event.sdp);
        await this.flushPendingIce();
        await this.applyVideoBitrateCap();
        break;

      case "call_ice":
        if (event.callId !== this.callId) return;
        await this.addIceCandidate(event.candidate);
        break;

      case "call_ended":
        if (event.callId !== this.callId) return;
        if (event.reason === "no_answer") {
          this.config.onError(this.isCaller ? "No answer" : "Missed call");
        } else if (event.reason === "unavailable") {
          this.config.onError("User is unavailable");
        } else if (event.reason === "disconnected") {
          this.config.onError("Call ended — connection lost");
        }
        this.cleanup("ended");
        break;

      case "error":
        if (this.phase === "idle") return;
        this.config.onError(event.error);
        this.cleanup("ended");
        break;
    }
  }

  private setPhase(phase: CallPhase, callId: string | null) {
    this.phase = phase;
    this.config.onPhaseChange(phase, callId);
  }

  private getRtc() {
    return (
      this.config.webrtc ?? {
        RTCPeerConnection: globalThis.RTCPeerConnection,
        getUserMedia: (constraints: MediaStreamConstraints) => {
          const mediaDevices = navigator.mediaDevices;
          if (!mediaDevices?.getUserMedia) {
            throw new Error(
              typeof window !== "undefined" && !window.isSecureContext
                ? "Calls require a secure context (HTTPS or the desktop app)"
                : "Camera/microphone APIs are unavailable in this environment"
            );
          }
          return mediaDevices.getUserMedia(constraints);
        },
      }
    );
  }

  private async ensurePeerConnection() {
    if (this.pc) return;
    if (this.pcInitPromise) {
      await this.pcInitPromise;
      return;
    }

    this.pcInitPromise = this.createPeerConnection();
    try {
      await this.pcInitPromise;
    } finally {
      this.pcInitPromise = null;
    }
  }

  private async createPeerConnection() {
    if (this.pc) return;

    const iceServers = await fetchIceServers(this.config.token);
    const { RTCPeerConnection } = this.getRtc();
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.callId) return;
      this.config.sendWs({
        type: "call_ice",
        callId: this.callId,
        candidate: ev.candidate.toJSON() as IceCandidatePayload,
      });
    };

    this.pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      this.config.onRemoteStream(stream ?? null);
      if (this.phase === "connecting") {
        this.setPhase("active", this.callId);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;

      if (this.pc.connectionState === "connected") {
        if (this.disconnectTimer) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = null;
        }
        this.setPhase("active", this.callId);
      }

      if (this.pc.connectionState === "failed") {
        this.config.onError("Connection lost");
        void this.endCall();
      }

      if (this.pc.connectionState === "disconnected") {
        if (this.disconnectTimer) return;
        this.disconnectTimer = setTimeout(() => {
          if (this.pc?.connectionState === "disconnected") {
            this.config.onError("Connection lost");
            void this.endCall();
          }
        }, DISCONNECT_GRACE_MS);
      }
    };
  }

  private async attachLocalMedia(callType: CallType) {
    if (this.localStream) return;
    if (this.mediaPromise) {
      await this.mediaPromise;
      return;
    }

    this.mediaPromise = this.acquireLocalMedia(callType);
    try {
      await this.mediaPromise;
    } finally {
      this.mediaPromise = null;
    }
  }

  private async acquireLocalMedia(callType: CallType) {
    if (this.localStream) return;

    const { getUserMedia } = this.getRtc();
    this.localStream = await getUserMedia({
      audio: true,
      video: callType === "video" ? VIDEO_CAPTURE_CONSTRAINTS : false,
    });

    for (const track of this.localStream.getTracks()) {
      this.pc?.addTrack(track, this.localStream);
    }
    await this.applyVideoBitrateCap();
    this.config.onLocalStream?.(this.localStream);
  }

  /** Cap video sender bitrate so TURN asymmetry does not spike and freeze frames. */
  private async applyVideoBitrateCap() {
    if (!this.pc || this.callType !== "video") return;

    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;

      const params = sender.getParameters();
      if (!params.encodings?.length) {
        params.encodings = [{}];
      }
      for (const encoding of params.encodings) {
        encoding.maxBitrate = VIDEO_MAX_BITRATE_BPS;
      }

      try {
        await sender.setParameters(params);
      } catch {
        // Some browsers reject setParameters before negotiation finishes;
        // callers re-apply after setLocalDescription / answer.
      }
    }
  }

  private async createAndSendOffer() {
    if (!this.pc || !this.callId) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.applyVideoBitrateCap();
    this.config.sendWs({
      type: "call_offer",
      callId: this.callId,
      sdp: offer as SessionDescriptionPayload,
    });
  }

  private async addIceCandidate(candidate: IceCandidatePayload) {
    if (!this.pc || !candidate.candidate) return;
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(candidate as RTCIceCandidateInit);
      return;
    }
    await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
  }

  private async flushPendingIce() {
    if (!this.pc?.remoteDescription) return;
    const pending = [...this.pendingIce];
    this.pendingIce = [];
    for (const c of pending) {
      await this.pc.addIceCandidate(c);
    }
  }

  private resetToIdle() {
    this.callId = null;
    this.peerId = null;
    this.isCaller = false;
    this.seenIncomingCallIds.clear();
    this.setPhase("idle", null);
  }

  private cleanup(phase: CallPhase) {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    this.pcInitPromise = null;
    this.mediaPromise = null;
    this.callId = null;
    this.peerId = null;
    this.isCaller = false;
    this.seenIncomingCallIds.clear();
    this.config.onRemoteStream(null);
    this.config.onLocalStream?.(null);
    this.setPhase(phase, null);
    if (phase === "ended") {
      setTimeout(() => this.setPhase("idle", null), 300);
    }
  }
}
