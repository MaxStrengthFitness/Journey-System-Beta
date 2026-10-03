/**
 * The greeting's two reads, for ONE studio (the one it greets you with),
 * once per greeting:
 *
 *  - today's bookings there: the Hub's own query shape (studio, start between
 *    the studio day's bounds, by start), so the index it uses already exists;
 *  - how many team jobs are open there: a count, which costs one read
 *    however many there are.
 *
 * Neither is ever said as a zero when it couldn't be read: a failure leaves
 * that line out (glanceLines). No listener and no timer: the greeting is a
 * moment, and the Hub takes over the day the moment you go in.
 */
import { useEffect, useState } from "react";
import {
  Timestamp,
  collection,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { endOfStudioDay, startOfStudioDay } from "../../lib/studio-time";
import type { Studio, Trainer } from "../../types";
import { staffIdsAt } from "../standing-week/check";
import { todayGlance, type GlanceBooking, type TodayGlance } from "./today-glance";

export interface TodayGlanceRead {
  loading: boolean;
  glance: TodayGlance | null;
  openJobs: number | null;
}

export function useTodayGlance(studio: Studio | null, me: Trainer | null, trainers: readonly Trainer[]): TodayGlanceRead {
  const [read, setRead] = useState<TodayGlanceRead>({ loading: Boolean(studio), glance: null, openJobs: null });
  const studioId = studio?.id ?? null;
  const tz = studio?.timezone || undefined;
  const siteId = studio?.mindbodySiteId ?? null;
  const myId = me?.id ?? null;
  // The trainers' ids and staff ids, as one key so a re-render costs no read.
  const trainersKey = trainers.map((t) => `${t.id}:${(t as any).mindbodyStaffId ?? ""}`).join(",");

  useEffect(() => {
    if (!studioId || !myId) {
      setRead({ loading: false, glance: null, openJobs: null });
      return;
    }
    let live = true;
    setRead({ loading: true, glance: null, openJobs: null });
    const now = new Date();

    const bookings = getDocs(
      query(
        collection(db, "schedules"),
        where("startTime", ">=", Timestamp.fromDate(startOfStudioDay(now, tz))),
        where("startTime", "<=", Timestamp.fromDate(endOfStudioDay(now, tz))),
        orderBy("startTime", "asc"),
        where("studioId", "==", studioId),
      ),
    )
      .then((snap) =>
        todayGlance(
          snap.docs.map((d) => d.data() as GlanceBooking),
          {
            trainerId: myId,
            trainerIds: new Set(trainers.map((t) => String(t.id))),
            staffIds: staffIdsAt(trainers as any, siteId),
          },
          now,
        ),
      )
      .catch((err) => {
        console.warn("The greeting couldn't read today's bookings.", err);
        return null;
      });

    const jobs = getCountFromServer(query(collection(db, "studios", studioId, "teamJobs"), where("status", "==", "open")))
      .then((snap) => snap.data().count)
      .catch((err) => {
        console.warn("The greeting couldn't count the open team jobs.", err);
        return null;
      });

    void Promise.all([bookings, jobs]).then(([glance, openJobs]) => {
      if (live) setRead({ loading: false, glance, openJobs });
    });
    return () => {
      live = false;
    };
    // trainersKey stands for `trainers`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, myId, tz, siteId, trainersKey]);

  return read;
}
