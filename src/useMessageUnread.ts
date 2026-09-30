import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

type MessageScope = "group" | "direct";
type ReadState = {
  targetId: string;
  readAt?: { toDate: () => Date };
};

function timestampMillis(value?: { toDate: () => Date }) {
  const date = value?.toDate?.();
  return date instanceof Date && Number.isFinite(date.getTime())
    ? date.getTime()
    : 0;
}

export function useMessageUnread(
  userId: string,
  scope: MessageScope,
  targetIds: string[],
  activeId: string,
) {
  const [readTimes, setReadTimes] = useState<Record<string, number>>({});
  const [latestTimes, setLatestTimes] = useState<Record<string, number>>({});
  const targetKey = JSON.stringify([...targetIds].sort());
  const stableTargetIds = useMemo<string[]>(
    () => JSON.parse(targetKey),
    [targetKey],
  );

  useEffect(() => {
    if (!db || !userId) return;
    const source = query(
      collection(db, "messageReadStates"),
      where("userId", "==", userId),
      where("scope", "==", scope),
    );
    return onSnapshot(source, (snapshot) => {
      const next: Record<string, number> = {};
      snapshot.docs.forEach((item) => {
        const data = item.data() as ReadState;
        next[data.targetId] = timestampMillis(data.readAt);
      });
      setReadTimes(next);
    });
  }, [scope, userId]);

  useEffect(() => {
    if (!db) return;
    setLatestTimes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => stableTargetIds.includes(id)),
      ),
    );
    const unsubscribes = stableTargetIds.map((targetId) => {
      const messages =
        scope === "group"
          ? collection(db!, "chatChannels", targetId, "messages")
          : collection(db!, "directConversations", targetId, "messages");
      return onSnapshot(
        query(messages, orderBy("createdAt", "desc"), limit(1)),
        (snapshot) => {
          const createdAt = snapshot.docs[0]?.data().createdAt as
            { toDate: () => Date } | undefined;
          setLatestTimes((current) => ({
            ...current,
            [targetId]: timestampMillis(createdAt),
          }));
        },
      );
    });
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [scope, stableTargetIds]);

  useEffect(() => {
    if (!db || !activeId || !latestTimes[activeId]) return;
    if ((readTimes[activeId] || 0) >= latestTimes[activeId]) return;
    const id = `${userId}_${scope}_${activeId}`;
    void setDoc(doc(db, "messageReadStates", id), {
      userId,
      scope,
      targetId: activeId,
      readAt: serverTimestamp(),
    });
  }, [activeId, latestTimes, readTimes, scope, userId]);

  const unreadIds = useMemo(
    () =>
      new Set(
        stableTargetIds.filter(
          (targetId) =>
            targetId !== activeId &&
            (latestTimes[targetId] || 0) > (readTimes[targetId] || 0),
        ),
      ),
    [activeId, latestTimes, readTimes, stableTargetIds],
  );

  return unreadIds;
}
