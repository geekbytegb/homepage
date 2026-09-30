import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ArrowUpRight, CalendarDays, Check, HelpCircle, X } from "lucide-react";
import { db } from "./firebase";
import type { IntranetEvent, IntranetEventRsvp } from "./types";

type RsvpResponse = IntranetEventRsvp["response"];

const responseLabels: Record<RsvpResponse, string> = {
  going: "참석",
  maybe: "미정",
  "not-going": "불참",
};

function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function IntranetEvents({
  events,
  user,
  displayName,
}: {
  events: IntranetEvent[];
  user: User;
  displayName: string;
}) {
  const [responses, setResponses] = useState<IntranetEventRsvp[]>([]);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, "intranetEventRsvps"),
      (snapshot) => {
        setResponses(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as IntranetEventRsvp,
          ),
        );
        setMessage("");
      },
      () => setMessage("행사 참석 현황을 불러오지 못했습니다."),
    );
  }, []);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.startTime.localeCompare(b.startTime) ||
          (a.order ?? 9999) - (b.order ?? 9999),
      ),
    [events],
  );

  async function respond(eventId: string, response: RsvpResponse) {
    if (!db) return;
    const id = `${eventId}_${user.uid}`;
    const current = responses.find(
      (item) => item.eventId === eventId && item.userId === user.uid,
    );
    setSavingEventId(eventId);
    setMessage("");
    try {
      if (current?.response === response) {
        await deleteDoc(doc(db, "intranetEventRsvps", id));
      } else {
        await setDoc(doc(db, "intranetEventRsvps", id), {
          eventId,
          userId: user.uid,
          displayName,
          response,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      setMessage("참석 응답을 저장하지 못했습니다.");
    } finally {
      setSavingEventId(null);
    }
  }

  return (
    <section className="intranet-panel intranet-event-panel">
      <div className="intranet-panel-heading">
        <span>INTERNAL EVENTS</span>
        <strong>{sortedEvents.length}</strong>
      </div>
      {message && (
        <p className="intranet-inline-message" role="status">
          {message}
        </p>
      )}
      <div className="intranet-event-list">
        {sortedEvents.length ? (
          sortedEvents.map((event) => {
            const eventResponses = responses.filter(
              (item) => item.eventId === event.id,
            );
            const mine = eventResponses.find(
              (item) => item.userId === user.uid,
            )?.response;
            const going = eventResponses.filter(
              (item) => item.response === "going",
            );
            const maybeCount = eventResponses.filter(
              (item) => item.response === "maybe",
            ).length;
            const notGoingCount = eventResponses.filter(
              (item) => item.response === "not-going",
            ).length;
            const eventUrl = safeHttpsUrl(event.url);
            return (
              <article className="intranet-event" key={event.id}>
                <div className="intranet-event-date" aria-label={event.date}>
                  <CalendarDays size={17} />
                  <time dateTime={event.date}>{event.date}</time>
                </div>
                <div className="intranet-event-copy">
                  <span>{event.category || "팀 행사"}</span>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                  <dl>
                    <div>
                      <dt>시간</dt>
                      <dd>
                        {event.startTime || "미정"}
                        {event.endTime ? `–${event.endTime}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>장소</dt>
                      <dd>{event.location || "추후 안내"}</dd>
                    </div>
                    <div>
                      <dt>주최</dt>
                      <dd>{event.organizer || "Geek Byte"}</dd>
                    </div>
                  </dl>
                  {eventUrl && (
                    <a href={eventUrl} target="_blank" rel="noreferrer">
                      행사 링크 열기 <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
                <div className="intranet-rsvp">
                  <div className="intranet-rsvp-counts">
                    <strong>참석 {going.length}</strong>
                    <span>미정 {maybeCount}</span>
                    <span>불참 {notGoingCount}</span>
                  </div>
                  {going.length > 0 && (
                    <p>
                      {going
                        .slice(0, 4)
                        .map((item) => item.displayName)
                        .join(", ")}
                      {going.length > 4 ? ` 외 ${going.length - 4}명` : ""}
                    </p>
                  )}
                  <div className="intranet-rsvp-actions">
                    {(
                      [
                        ["going", "참석", Check],
                        ["maybe", "미정", HelpCircle],
                        ["not-going", "불참", X],
                      ] as const
                    ).map(([value, label, Icon]) => (
                      <button
                        className={mine === value ? "selected" : ""}
                        disabled={savingEventId === event.id}
                        key={value}
                        onClick={() => respond(event.id, value)}
                        aria-pressed={mine === value}
                        title={
                          mine === value
                            ? `${responseLabels[value]} 응답 취소`
                            : `${responseLabels[value]} 응답`
                        }
                      >
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="intranet-empty">예정된 내부 행사가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
