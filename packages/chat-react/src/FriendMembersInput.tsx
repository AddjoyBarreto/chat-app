import {
  appendMemberUsername,
  filterFriendsForMemberInput,
  type FriendPick,
} from "@vaultchat/client";
import { useEffect, useRef, useState } from "react";

export interface FriendMembersInputProps {
  friends: FriendPick[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

export function FriendMembersInput({
  friends,
  value,
  onChange,
  placeholder = "Add friends by username…",
  disabled,
  className = "vc-friend-members",
  inputClassName = "vc-friend-members__input",
}: FriendMembersInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const suggestions = filterFriendsForMemberInput(friends, value);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(username: string) {
    onChange(appendMemberUsername(value, username));
    setOpen(true);
  }

  return (
    <div className={className} ref={rootRef}>
      <input
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            pick(suggestions[0].username);
          }
        }}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
      />
      {open && suggestions.length > 0 && (
        <ul className="vc-friend-members__dropdown" role="listbox">
          {suggestions.map((f) => (
            <li key={f.userId}>
              <button
                type="button"
                className="vc-friend-members__item"
                onClick={() => pick(f.username)}
              >
                <span className="vc-friend-members__avatar">{f.username[0]}</span>
                <span>@{f.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && friends.length === 0 && (
        <p className="vc-friend-members__hint">Add friends first to invite them to a group.</p>
      )}
    </div>
  );
}
