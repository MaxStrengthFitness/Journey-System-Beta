/**
 * THE BUG REPORTS' ONE READ — the newest hundred, as ReportViews.
 *
 * Shared by Admins → Bug reports and the Admins dashboard's Home (the Admins
 * room, Sep 28 2026), so both ask the same question the same way: the
 * newest `REPORTS_PAGE` by `createdAt`, read once, never streamed (a report
 * is read minutes or days after it is written, and a listener on a
 * collection that only grows would cost a read per report per admin
 * session). A failed read throws; the caller says so, never "no reports".
 */
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../../firebase";
import { toReportView, type RawReport, type ReportView } from "./reportView";

/**
 * Enough to triage from without reading the whole collection. A beta feedback
 * inbox grows forever and nobody works a backlog past the first hundred; if
 * one is ever needed, the fix is a cursor, not a bigger number.
 */
export const REPORTS_PAGE = 100;

export async function fetchRecentReports(): Promise<ReportView[]> {
  const snap = await getDocs(query(collection(db, "bug_reports"), orderBy("createdAt", "desc"), limit(REPORTS_PAGE)));
  return snap.docs.map((d, i) => toReportView({ id: d.id, ...(d.data() as RawReport) }, i));
}
