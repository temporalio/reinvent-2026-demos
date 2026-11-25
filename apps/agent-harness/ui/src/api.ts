import { HttpTransport, startSession, type SessionSummary } from "@temporalio/agent-harness-client";
import { ZiggyChatAgent, type TravelerContext } from "./generated/ZiggyChatAgent.ts";

/** One transport for the page, against the same `api/` the console uses. */
export const transport = new HttpTransport();

/** What `GET api/view` returns: everything the page needs on load, in one request. */
/** A session as this demo's API returns it: the harness summary plus its Workflow run ID. */
export type TripSession = SessionSummary & { run_id?: string | null; plan?: Partial<TripPlan> };

export interface PageView {
  /** Every session this person may name starts with this. */
  session_prefix: string;
  /** This namespace in the Temporal UI. */
  temporal_ui_url: string;
  sessions: TripSession[];
}

export async function loadView(): Promise<PageView> {
  const response = await fetch("api/view",{signal:AbortSignal.timeout(10_000)});
  if (!response.ok) throw new Error(`Couldn't load the demo (${response.status})`);
  return response.json();
}

/** A new session ID inside the caller's prefix, chosen here so the page needn't wait for it. */
export function newSessionId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The traveler's local date and time zone, so Ziggy plans from today rather than from
 *  whenever its model was trained. */
export function travelerContext(now = new Date()): TravelerContext {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  };
}

export function createTrip(sessionId: string,plan:TripPlan): Promise<TripSession> {
  // The demo's POST /sessions adds run_id; the client passes the response through as-is.
  const data:TravelerContext&TripPlan={...travelerContext(),...plan};
  return startSession(transport, ZiggyChatAgent, { sessionId, data }) as Promise<TripSession>;
}

export type TripPlan={traveler_name:string;origin_city:string;destination_city:string};
export const travelerNames=['Alex Morgan','Jordan Lee','Priya Shah','Mateo Rivera','Avery Chen','Fatima Hassan','Gabriela Santos','Noah Williams','Samira Patel','Taylor Nguyen'];
export const tripCities=['Las Vegas (LAS)','San Francisco (SFO)','Seattle (SEA)','New York (JFK)','Chicago (ORD)','Austin (AUS)','Toronto (YYZ)','Vancouver (YVR)','Montréal (YUL)','Mexico City (MEX)'];
export function tripPrompt(plan:TripPlan):string {
 return `Plan a simulated three-night trip for ${plan.traveler_name} from ${plan.origin_city} to ${plan.destination_city}, departing two weeks from today. Show flight and hotel options, then ask for approval before booking. All bookings are fictional.`;
}
