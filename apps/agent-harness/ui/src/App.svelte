<script lang="ts">
  import { createHarnessContext } from "@temporalio/agent-harness-svelte";
  import { createTrip, loadView, newSessionId, travelerNames, tripCities, tripPrompt, type PageView, type TripPlan } from "./api.ts";
  import logo from "./assets/temporal-logo.svg";
  import { motion, toggleMotion } from "./motion.svelte.ts";
  import Backdrop from "./Backdrop.svelte";
  import Trip from "./Trip.svelte";

  createHarnessContext();
  let view = $state<PageView | null>(null);
  let loadError = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let runId = $state<string | null>(null);
  let creating = $state<string | null>(null);
  let preview = $state<boolean | null>(null);
  let previewNotice = $state<string | null>(null);
  let formOpen = $state(false);
  let refreshing = $state(false);
  let firstMessage = $state<string | null>(null);
  let traveler = $state(travelerNames[0]);
  let origin = $state(tripCities[0]);
  let destination = $state(tripCities[1]);
  const station = new URL(location.href).searchParams.get('station');
  const stationLabel = station && /^[1-4]$/.test(station) ? `Station ${station}` : 'This station';
  const current = $derived(view?.sessions.find(session=>session.workflow_id===sessionId));
  const trips = $derived([...(view?.sessions??[])].sort((a,b)=>b.created_at-a.created_at));

  function show(id:string,run:string|null=null) {
    const url=new URL(location.href);url.searchParams.set('s',id);history.replaceState(null,'',url);
    sessionId=id;runId=run;formOpen=false;
  }
  async function allTrips() {
    if(refreshing)return;
    refreshing=true;
    sessionId=null;runId=null;firstMessage=null;formOpen=false;loadError=null;
    const url=new URL(location.href);url.searchParams.delete('s');history.replaceState(null,'',url);
    try{view=await loadView();}catch(error){loadError=error instanceof Error?error.message:'Could not load trips.';}
    finally{refreshing=false;}
  }
  function newTrip(){sessionId=null;runId=null;firstMessage=null;formOpen=true;loadError=null;}
  async function startTrip(event:SubmitEvent) {
    event.preventDefault();
    if(!view||preview!==false||creating||origin===destination)return;
    const plan:TripPlan={traveler_name:traveler,origin_city:origin,destination_city:destination};
    const id=newSessionId(view.session_prefix);creating=id;loadError=null;
    try {
      const session=await createTrip(id,plan);
      view={...view,sessions:[session,...view.sessions.filter(item=>item.workflow_id!==id)]};
      firstMessage=tripPrompt(plan);show(id,session.run_id??null);
    }catch(error){loadError=`Couldn't start a trip: ${error instanceof Error?error.message:'Try again.'}`;}
    finally{creating=null;}
  }
  Promise.all([loadView(),fetch('/travel-agent/api/local-preview',{signal:AbortSignal.timeout(10_000)}).then(response=>{
    if(!response.ok)throw Error('Demo capabilities could not be loaded');
    return response.json() as Promise<{preview:boolean;notice:string|null}>;
  })]).then(([loaded,capabilities])=>{
    preview=capabilities.preview;previewNotice=capabilities.notice;view=loaded;
    const requested=new URL(location.href).searchParams.get('s');
    if(requested&&loaded.sessions.some(session=>session.workflow_id===requested)){
      show(requested,loaded.sessions.find(session=>session.workflow_id===requested)?.run_id??null);
    }
  },(error:Error)=>loadError=error.message);

  const workflowLink=$derived(view&&sessionId?`${view.temporal_ui_url}/workflows/${encodeURIComponent(sessionId)}`+(runId?`/${encodeURIComponent(runId)}/timeline`:''):null);
  const consoleLink=$derived(sessionId?`console/?s=${encodeURIComponent(sessionId)}`:'console/');
</script>

<div class="app" class:motion-paused={motion.paused}>
  <Backdrop />
  <header class="topbar">
    <div class="brand"><img src={logo} alt="Temporal" width="132" height="34"/><div><p class="eyebrow">Agent Harness · Human in the loop</p><h1 class="title">Ziggy, a durable travel agent</h1></div></div>
    <nav class="links" aria-label="Views">
      <button class="button secondary" onclick={()=>void allTrips()} disabled={creating!==null}>All trips</button>
      {#if workflowLink}<a class="button secondary" href={workflowLink} target="_blank" rel="noreferrer">View workflow</a>{/if}
      <a class="button secondary" href={consoleLink}>Harness console</a>
      {#if !motion.reduced}<button class="button secondary" aria-pressed={motion.paused} onclick={toggleMotion}>{motion.paused?'Play motion':'Pause motion'}</button>{/if}
      <button class="button primary" onclick={newTrip} disabled={!view||creating!==null}>New trip</button>
    </nav>
  </header>
  {#if previewNotice}<aside class="card booth-native-notice" role="status">{previewNotice}</aside>{/if}
  {#if loadError}<div class="card failure" role="alert">{loadError}</div>{/if}
  {#if sessionId && !preview}
    {#key sessionId}<Trip {sessionId} {runId} initialPrompt={firstMessage} onInitialSent={()=>firstMessage=null} readOnly={!!current?.closed}/>{/key}
  {:else if formOpen}
    <main class="trip-lobby">
      <section class="card trip-start"><p class="eyebrow">{stationLabel} / New simulated trip</p><h2>Where are we going?</h2>
        <form onsubmit={startTrip} class="trip-form">
          <label for="trip-traveler">Traveler<select id="trip-traveler" bind:value={traveler}>{#each travelerNames as name}<option value={name}>{name}</option>{/each}</select></label>
          <label for="trip-origin">Departure city<select id="trip-origin" bind:value={origin}>{#each tripCities as city}<option value={city}>{city}</option>{/each}</select></label>
          <label for="trip-destination">Destination<select id="trip-destination" bind:value={destination}>{#each tripCities as city}<option value={city} disabled={city===origin}>{city}</option>{/each}</select></label>
          <p class="muted">Three nights, departing in two weeks. Ziggy will find fictional flights and hotels and ask before booking.</p>
          {#if origin===destination}<p role="status">Choose a different destination.</p>{/if}
          {#if preview}<p role="status">The local presentation adapter has no Gemini worker. The form is available for layout review; no trip will be started.</p>{/if}
          <div class="trip-actions"><button class="button primary" type="submit" disabled={preview!==false||creating!==null||origin===destination}>{creating?'Starting trip…':'Plan this trip'}</button><button class="button secondary" type="button" onclick={()=>void allTrips()} disabled={creating!==null}>Cancel</button></div>
        </form>
      </section>
      <section class="card"><p class="eyebrow">What this shows</p><h2>A conversation that survives interruptions</h2><p>Your selections start a new Temporal Workflow. Approvals, choices, and the trip board stay with that trip if a worker restarts.</p><p>All travel services are simulated. Gemini and Temporal are real.</p></section>
    </main>
  {:else}
    <main class="trip-lobby">
      <section class="card trip-history"><div class="panel-head"><div><p class="eyebrow">{stationLabel}</p><h2>Trips so far</h2></div><button class="button secondary" onclick={()=>void allTrips()} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button></div>
        <p class="muted">Choose a trip to review or continue, or start a new one. Showing up to 50 recent trips on this station.</p>
        <div class="trip-list" aria-label="Trips on this station">
          {#each trips as trip (trip.workflow_id)}
            <button class="trip-summary" onclick={()=>{firstMessage=null;show(trip.workflow_id,trip.run_id??null)}}>
              <strong>{trip.plan?.traveler_name??'Earlier trip'}</strong><span>{trip.plan?.origin_city??'Travel conversation'}{trip.plan?.destination_city?` → ${trip.plan.destination_city}`:''}</span>
              <small>{new Date(trip.created_at*1000).toLocaleString()} · {trip.closed?'Ended / review':'Open / continue'}</small>
            </button>
          {:else}<p class="muted">{view?'No trips yet on this station.':'Loading trips…'}</p>{/each}
        </div>
      </section>
      <section class="card trip-start"><p class="eyebrow">Your next adventure</p><h2>Plan a new trip</h2><p>Pick a traveler and two cities. Ziggy writes a Python travel script, waits for your approval, and runs each tool as a durable Activity.</p><button class="button primary" onclick={newTrip} disabled={!view}>New trip</button><p class="muted">Fictional bookings. No airlines or hotels are contacted.</p></section>
    </main>
  {/if}
</div>
