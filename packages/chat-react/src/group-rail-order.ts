import type { GroupInfo } from "@vaultchat/protocol";
import { createLocalStorageAdapter } from "@vaultchat/client";
import { useCallback, useEffect, useMemo, useState } from "react";

const KEY_PREFIX = "vaultchat_group_rail_order_";

function storageKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export async function loadGroupRailOrder(userId: string): Promise<string[]> {
  const storage = createLocalStorageAdapter();
  try {
    const raw = await storage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function saveGroupRailOrder(userId: string, order: string[]): Promise<void> {
  const storage = createLocalStorageAdapter();
  await storage.setItem(storageKey(userId), JSON.stringify(order));
}

export function sortGroupsByRailOrder(groups: GroupInfo[], order: string[]): GroupInfo[] {
  const map = new Map(groups.map((g) => [g.id, g]));
  const sorted: GroupInfo[] = [];
  for (const id of order) {
    const g = map.get(id);
    if (g) {
      sorted.push(g);
      map.delete(id);
    }
  }
  for (const g of groups) {
    if (map.has(g.id)) sorted.push(g);
  }
  return sorted;
}

export function mergeGroupRailOrder(existing: string[], groups: GroupInfo[]): string[] {
  const ids = new Set(existing);
  const next = [...existing];
  for (const g of groups) {
    if (!ids.has(g.id)) {
      next.push(g.id);
      ids.add(g.id);
    }
  }
  const valid = new Set(groups.map((g) => g.id));
  return next.filter((id) => valid.has(id));
}

export function useGroupRailOrder(userId: string, groups: GroupInfo[]) {
  const [order, setOrder] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadGroupRailOrder(userId).then((saved) => {
      if (cancelled) return;
      setOrder(mergeGroupRailOrder(saved, groups));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    setOrder((prev) => mergeGroupRailOrder(prev, groups));
  }, [groups, ready]);

  const sortedGroups = useMemo(() => sortGroupsByRailOrder(groups, order), [groups, order]);

  const moveGroup = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      setOrder((prev) => {
        const next = [...prev];
        const [item] = next.splice(fromIndex, 1);
        if (!item) return prev;
        next.splice(toIndex, 0, item);
        void saveGroupRailOrder(userId, next);
        return next;
      });
    },
    [userId]
  );

  const bumpGroup = useCallback(
    (groupId: string) => {
      setOrder((prev) => {
        const next = prev.filter((id) => id !== groupId);
        next.unshift(groupId);
        void saveGroupRailOrder(userId, next);
        return next;
      });
    },
    [userId]
  );

  return { sortedGroups, moveGroup, bumpGroup, ready };
}
