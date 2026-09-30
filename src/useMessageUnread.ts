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
export type MessageActivity = {
  authorName: string;
  createdAt: number;
  text: string;
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
  const [latestActivity, setLatestActivity] = useState<
    Record<string, MessageActivity>
  >({});
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
    setLatestActivity((current) =>
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
          const data = snapshot.docs[0]?.data();
          setLatestActivity((current) => {
            if (!data) {
              const next = { ...current };
              delete next[targetId];
              return next;
            }
            return {
              ...current,
              [targetId]: {
                authorName:
                  typeof data.authorName === "string" ? data.authorName : "",
                createdAt: timestampMillis(
                  data.createdAt as { toDate: () => Date } | undefined,
                ),
                text: typeof data.text === "string" ? data.text : "",
              },
            };
          });
        },
      );
    });
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [scope, stableTargetIds]);

  useEffect(() => {
    const latestTime = latestActivity[activeId]?.createdAt || 0;
    if (!db || !activeId || !latestTime) return;
    if ((readTimes[activeId] || 0) >= latestTime) return;
    const id = `${userId}_${scope}_${activeId}`;
    void setDoc(doc(db, "messageReadStates", id), {
      userId,
      scope,
      targetId: activeId,
      readAt: serverTimestamp(),
    });
  }, [activeId, latestActivity, readTimes, scope, userId]);

  const unreadIds = useMemo(
    () =>
      new Set(
        stableTargetIds.filter(
          (targetId) =>
            targetId !== activeId &&
            (latestActivity[targetId]?.createdAt || 0) >
              (readTimes[targetId] || 0),
        ),
      ),
    [activeId, latestActivity, readTimes, stableTargetIds],
  );

  return { latestActivity, unreadIds };
}
