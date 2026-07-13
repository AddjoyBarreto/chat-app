export function MediaPermissionDialog({
  kind,
  onOpenSettings,
  onDismiss,
}: {
  kind: "microphone" | "camera";
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  const title = kind === "microphone" ? "Microphone access required" : "Camera access required";
  const body =
    kind === "microphone"
      ? "VaultChat needs microphone access to start voice and video calls. Enable it in System Settings, then try again."
      : "VaultChat needs camera access for video calls. Enable it in System Settings, then try again.";

  return (
    <div className="dc-perm-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="dc-perm-dialog"
        role="dialog"
        aria-labelledby="dc-perm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dc-perm-title">{title}</h2>
        <p>{body}</p>
        <div className="dc-perm-dialog__actions">
          <button type="button" className="dc-perm-dialog__secondary" onClick={onDismiss}>
            Not now
          </button>
          <button type="button" className="dc-perm-dialog__primary" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
