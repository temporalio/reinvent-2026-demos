import '../shared/theme.css';
import './photobooth.css';
import { h, mount, sleep } from '../shared/dom';
import { api, poll, withBase } from '../shared/api';
import { ApiError, requiresEmailAtCapture } from '../shared/httpError';
import { installChrome } from '../shared/chrome';
import { onScreenKeyboard } from '../shared/keyboard';
import { CONSENT_TEXT_VERSION, consentNote } from '../shared/consent';
import { openCamera, type CameraSource } from './camera';
import { shutter, tick } from './sound';

// Flow: camera → countdown → review → generation + email entry → finished strip.

// ---------- Types mirrored from backend/holodeck/photobooth ----------
interface Step {
  key: string;
  label: string;
  state: 'pending' | 'running' | 'retrying' | 'done' | 'failed' | 'skipped';
  attempts: number;
  detail: string;
  url: string | null;
  seconds: number;
}
interface Status {
  session_id: string;
  workflow_id: string;
  temporal_ui_url?: string | null;
  stage: 'spooled' | 'unreachable' | 'starting' | 'processing' | 'awaiting_email' | 'expired' | 'sending' | 'done';
  steps: Step[];
  strip_url?: string | null;
  animated_url?: string | null;
  email: string;
}
interface Started { session_id: string; workflow_id: string; spooled: boolean; provider: string; temporal_ui_url: string | null }

/** The workflow ID, linked when the server knows a Temporal UI (the booth's lower panel follows the link). */
function workflowRef(id: string, url: string | null | undefined): HTMLElement {
  if(url){const target=new URL(url,location.origin);if(target.pathname.startsWith('/_temporal/'))url=target.pathname+target.search+target.hash;}
  const label = h('b', {}, id);
  return url ? h('a', { href: url, onclick: (event: Event) => {
    if (window.parent !== window) {
      event.preventDefault();
      window.parent.postMessage({type:'booth:workflow', url, activate:true}, location.origin);
    }
  } }, label) : label;
}

const STALL_MS = 45_000; // no visible progress for this long → "we'll email it"

// ---------- State ----------
const root = document.getElementById('app')!;
let camera: CameraSource | null = null;
let retakesLeft = 1;
let photo = '';
let email = '';
let cleanups: (() => void)[] = [];
let disposed=false;
window.addEventListener('pagehide',()=>{
  disposed=true;
  cleanups.splice(0).forEach(cleanup=>cleanup());
  camera?.stop();camera=null;photo='';email='';
},{once:true});

installChrome();

function screen(...children: (Node | null)[]): HTMLElement {
  cleanups.forEach((c) => c());
  cleanups = [];
  if(window.parent!==window)window.parent.postMessage({type:'booth:photobooth-stage',result:children.some(child=>child instanceof HTMLElement && child.classList.contains('pb-result'))},location.origin);
  return mount(root, h('div', { class: 'screen fade-in', style: 'align-items:center' }, ...children));
}

function later(fn: () => void, ms: number): void {
  const t = window.setTimeout(fn, ms);
  cleanups.push(() => clearTimeout(t));
}

function reset(): void {
  retakesLeft = 1;
  photo = '';
  email = '';
  void attract();
}

function viewfinder(content: Node, overlay?: Node | null): HTMLElement {
  // Re-attaching a <video> can pause it; nudge it back to playing.
  if (content instanceof HTMLVideoElement) queueMicrotask(() => void content.play().catch(() => undefined));
  return h('div', { class: 'pb-viewfinder' }, content, h('div', { class: 'pb-brackets' }, h('i')), overlay ?? null);
}

function header(title: string, sub?: string): HTMLElement {
  return h('div', { style: 'text-align:center;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1)' },
    h('p', { class: 'temporal-badge' }, 'Holodeck · Holo-Booth'),
    h('h1', {}, title),
    sub ? h('p', { class: 'dim', style: 'margin:0;font-size:calc(var(--u)*2.2)' }, sub) : null);
}

// ---------- 1. Attract ----------
async function attract(): Promise<void> {
  if (!camera) {
    screen(header('Starting camera', 'Allow camera access in Chrome and macOS if prompted.'),
      h('p', {class:'dim',role:'status'}, 'Connecting to your camera… Camera controls will appear if it cannot start.'));
    let preferred: string | undefined;
    try { preferred = localStorage.getItem('holodeck.camera') || undefined; } catch { /* Use the default camera. */ }
    camera = await openCamera(preferred);
    if(disposed){camera.stop();camera=null;return;}
    if (!camera.live && preferred) { camera.stop(); camera = await openCamera();if(disposed){camera.stop();camera=null;return;} }
  }
  screen(
    header('Holo-Booth', 'Step into the frame. Our AI will beam you across the galaxy.'),
    h('div', { class: 'pb-split' },
      viewfinder(camera.el, camera.live ? h('div', { class: 'pb-rec' }, 'Live') : null),
      h('div', { class: 'pb-side' },
        h('div', { class: 'panel' },
          h('span', { class: 'panel-tab' }, 'How it works'),
          h('p', { style: 'margin:0' }, 'One photo. Four AI-generated frames: become an alien, fly a starship, explore a strange new world. We email you the strip.')),
        h('div', {class:'pb-camera-slot'}),
        h('button', { class: 'btn mint big', onclick: () => void countdown() }, 'Take my photo'),
      ),
    ),
  );
  root.querySelector('.pb-camera-slot')?.append(cameraControls());
}

/** Camera choice is local to this browser; only the captured portrait is submitted. */
function cameraControls(): HTMLElement {
  const controls = h('div', { class:'pb-camera-controls' });
  if (new URLSearchParams(location.search).has('testcam')) return controls;
  const status = h('p', { class:'dim', role:'status' }, camera?.error ?? '');
  const select = h('select', { 'aria-label':'Camera' }, h('option', { value:'' }, 'Default camera'));
  const retry = h('button', { class:'btn ghost', onclick:() => void change(select.value) }, camera?.live ? 'Reconnect camera' : 'Enable camera');
  async function devices(): Promise<void> {
    try {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind==='videoinput' && device.deviceId);
      select.replaceChildren(h('option', {value:''}, 'Default camera'), ...cameras.map((device,index) => h('option', {value:device.deviceId}, device.label || `Camera ${index+1}`)));
      select.value = camera?.deviceId ?? '';
    } catch { status.textContent = 'Allow camera access to see available cameras.'; }
  }
  async function change(deviceId: string): Promise<void> {
    select.disabled = retry.disabled = true;
    camera?.stop();
    camera = await openCamera(deviceId || undefined);
    if(disposed){camera.stop();camera=null;return;}
    if (camera.live && camera.deviceId) { try { localStorage.setItem('holodeck.camera',camera.deviceId); } catch { /* Browser storage may be disabled. */ } }
    await attract();
  }
  select.addEventListener('change', () => void change(select.value));
  controls.append(h('label', {}, 'Camera', select), retry, status);
  const deviceChange = () => void devices();
  navigator.mediaDevices?.addEventListener('devicechange', deviceChange);
  cleanups.push(() => navigator.mediaDevices?.removeEventListener('devicechange', deviceChange));
  void devices();
  return controls;
}

// ---------- 2. Capture ----------
async function countdown(): Promise<void> {
  const count = h('div', { class: 'pb-count' });
  screen(header('Get ready!', 'Look at the camera'), h('div', { class: 'pb-split', style: 'justify-items:center' }, viewfinder(camera!.el, count)));
  for (const n of [3, 2, 1]) {
    count.replaceChildren(h('span', {}, String(n)));
    tick(n === 1 ? 1320 : 880);
    await sleep(1000);
    if(disposed)return;
  }
  count.replaceChildren();
  shutter();
  photo = camera!.capture();
  const flash = h('div', { class: 'pb-flash' });
  document.body.append(flash);
  setTimeout(() => flash.remove(), 650);
  review();
}

// ---------- 4. Review (+ quick best-effort photo check) ----------
interface QuickCheck { checked: boolean; usable?: boolean; reason?: string; face_count?: number }

function hintFor(reason = ''): string {
  const r = reason.toLowerCase();
  if (r.includes('dark')) return 'It\u2019s a little dark over there. Step into the light!';
  if (r.includes('blur')) return 'A bit blurry! Hold still for the countdown and try again.';
  return 'We can\u2019t see your face. Step into the frame and into the light!';
}

async function quickCheck(image: string): Promise<QuickCheck | null> {
  try {
    return await api<QuickCheck>('/photobooth/analyze',{image},undefined,AbortSignal.timeout(4000));
  }catch{return null;}

}

function review(): void {
  const shot = photo;
  const hint = h('div', {});
  const retakeSlot = h('div', {});
  const renderRetake = (free: boolean) => {
    retakeSlot.replaceChildren(
      free
        ? h('button', { class: 'btn amber', onclick: () => void countdown() }, 'Try again (free)')
        : retakesLeft > 0
          ? h('button', { class: 'btn ghost', onclick: () => { retakesLeft--; void countdown(); } }, 'Retake (1 left)')
          : h('span'));
  };
  renderRetake(false);
  screen(
    header('Looking good!', retakesLeft > 0 ? 'Happy with it? You get one retake.' : 'That\u2019s the one. Let\u2019s go!'),
    h('div', { class: 'pb-split' },
      viewfinder(h('img', { src: photo, alt: 'Your photo' })),
      h('div', { class: 'pb-side' },
        hint,
        h('button', { class: 'btn mint big', onclick: () => void submit() }, 'Beam me up \u2728'),
        retakeSlot,
        h('p', {class:'consent'}, 'Continue to create four AI adventures from this photo. Enter your email on the next screen while they render.'),
      ),
    ),
  );
  void quickCheck(shot).then((r) => {
    if (disposed || !hint.isConnected || photo !== shot || !r?.checked || r.usable !== false) return;
    // An unusable photo doesn't use up the visitor's one retake.
    const title = root.querySelector('h1');
    if (title) title.textContent = 'Almost!';
    root.querySelector('h1 + p')?.remove();
    hint.replaceChildren(h('div', { class: 'panel pb-hint fade-in' },
      h('span', { class: 'panel-tab' }, 'Sensor check'),
      h('p', { style: 'margin:0;font-size:calc(var(--u)*2.4)' }, hintFor(r.reason))));
    renderRetake(true);
  });
}

// ---------- 5. Submit (local-first on the server) ----------
async function submit(): Promise<void> {
  screen(header('Beaming…', 'Saving your photo'));
  try {
    const s = await api<Started>('/photobooth/sessions', { image: photo, wait_for_email:true, consent_text_version: CONSENT_TEXT_VERSION });
    camera?.stop(); camera=null; photo='';
    processing(s);
  } catch (e) {
    if(requiresEmailAtCapture(e))legacyRecipient();
    else failure(e);
  }
}

/** Earlier hosted APIs require the recipient with the capture. Keep the portrait
 * and collect it here; never pretend images are rendering before that request. */
function legacyRecipient(message=''):void {
  camera?.stop();camera=null;
  const kb=onScreenKeyboard({mode:'email',initial:email,placeholder:'you@company.com',submitLabel:'Create my strip',
    onSubmit:value=>{email=value;void submitWithRecipient();}});
  screen(header('Your photo is ready', 'Add your email to start developing your four adventures.'),
    h('div',{class:'pb-split even'},viewfinder(h('img',{src:photo,alt:'Your captured portrait'})),
      h('div',{class:'pb-side'},kb.el,consentNote(),message?h('p',{class:'pb-error',role:'alert'},message):null,
        h('button',{class:'btn ghost',onclick:reset},'Cancel'))));
  cleanups.push(kb.destroy);
}
async function submitWithRecipient():Promise<void> {
  screen(header('Starting your adventures', 'Saving your photo and email.'));
  try {
    const started=await api<Started>('/photobooth/sessions',{image:photo,email,consent_text_version:CONSENT_TEXT_VERSION});
    photo='';
    if(started.spooled)saved();else processing(started,true);
  }catch{legacyRecipient('We couldn’t connect to the photo service. Please try again; your portrait is still here.');}
}

// ---------- 6a. Saved (offline / stalled): the email comes later; Done starts over ----------
function saved(): void {
  screen(
    header('Saved!', ''),
    h('div', { class: 'pb-side', style: 'align-items:center;text-align:center' },
      h('div', { class: 'panel' },
        h('span', { class: 'panel-tab' }, 'Transmission queued'),
        h('p', { style: 'margin:0;font-size:calc(var(--u)*2.6)' },
          'Your holo-strip will arrive by email once our subspace relay reconnects.'),
        h('p', { class: 'dim' }, `Destination: ${email}`)),
      h('p', { class: 'dim' }, 'Your photo is stored safely on this ship. Temporal will finish the job, even if the network doesn’t cooperate right now.'),
      h('button', { class: 'btn mint big', onclick: reset }, 'Done'),
    ),
  );
}

// ---------- 6b. Live progress ----------
function fillThumbs(thumbs: HTMLElement, st: Status): void {
  st.steps.filter((s) => s.key.startsWith('render-')).forEach((r, i) => {
    const slot = thumbs.children[i] as HTMLElement | undefined;
    if (slot && r.url && !slot.querySelector('img')) {
      slot.replaceChildren(h('img', { src: withBase(r.url), alt: r.label })); // /media/... from the backend
      slot.style.animation = 'none';
    }
  });
}

function stepRow(s: Step): HTMLElement {
  const meta =
    s.state === 'retrying' ? `retry #${s.attempts}` :
    s.state === 'done' ? (s.detail || (s.seconds >= 1 ? `${s.seconds.toFixed(0)}s` : 'done')) :
    s.state === 'running' ? 'working…' : '';
  return h('div', { class: `wf-step ${s.state}` },
    h('span', { class: 'dot' }),
    h('span', {}, s.label),
    h('span', { class: 'meta' }, meta),
    s.state === 'retrying' && s.detail ? h('span', { class: 'why' }, `⚠ ${s.detail.replace(/^[\w[\]-]+: /, '').slice(0, 120)}`) : null);
}

function processing(s: Started, recipientAccepted=false): void {
  const steps = h('div', { class: 'wf-steps pb-steps' });
  const thumbs = h('div', { class: 'pb-thumbs' }, ...[0, 1, 2, 3].map(() => h('div', { class: 'pb-thumb' })));
  const recipient = h('div', { class:'pb-side pb-recipient' });
  const network = h('p', {class:'dim',role:'status'});
  const error = h('p', {class:'dim',role:'alert'});
  let accepted=recipientAccepted, saving=false, active=true;
  let latest:Status|null=null;
  screen(
    header('Your adventures are developing', recipientAccepted ? 'We’re creating your four-picture strip. Your email is saved.' : 'Add your email while we create your four-picture strip.'),
    h('div', { class: 'pb-split even' },
      h('div', { class: 'pb-side' }, thumbs, network,
        h('div', { class: 'panel' }, h('span', { class: 'panel-tab' }, 'Live workflow'), steps)),
      recipient),
  );
  cleanups.push(()=>{active=false;});
  let kb:ReturnType<typeof onScreenKeyboard>|null=null;
  function recipientSaved():void {
    recipient.replaceChildren(h('h2',{},'You’re on the crew list!'),h('p',{},`We’ll send your strip to ${email}.`),
      h('p',{class:'dim'},'Stay to see your finished adventures, or let Temporal finish and email them.'),
      h('button',{class:'btn mint big',onclick:reset},'Done — we’ll email it'));
  }
  if(accepted)recipientSaved();
  else {
    kb=onScreenKeyboard({mode:'email',initial:email,placeholder:'you@company.com',submitLabel:'Send my strip',
      onSubmit:value=>{void saveRecipient(value);}});
    recipient.append(h('h2',{},'Where should we send your strip?'),kb.el,consentNote(),error,
      h('button',{class:'btn ghost',onclick:reset},'Cancel'));
    cleanups.push(kb.destroy);
  }
  async function saveRecipient(value:string):Promise<void> {
    if(saving||accepted)return;
    saving=true; error.textContent='Saving your email…';
    try {
      await api(`/photobooth/sessions/${s.session_id}/recipient`,{email:value});
      if(!active)return;
      email=value;accepted=true;kb?.destroy();
      recipientSaved();
      if(latest)update(latest);
    }catch{if(active)error.textContent='We couldn’t save your email yet. Please try again; your photos are still processing.';}
    finally{saving=false;}
  }
  let fingerprint = '';
  let lastChange = Date.now();
  function update(st:Status):boolean|void {
    latest=st;
    if(st.stage==='spooled'||st.stage==='unreachable') {
      network.textContent='Your photo is saved. Waiting for the processing connection to return.';
      if(accepted){saved();return true;}
      return;
    }
    network.textContent=st.stage==='awaiting_email'?'Your pictures are ready. Add your email to finish.':'';
    const fp=st.steps.map(x=>`${x.state}${x.attempts}`).join();
    if(fp!==fingerprint){fingerprint=fp;lastChange=Date.now();}
    steps.replaceChildren(...st.steps.map(stepRow));
    if(accepted)fillThumbs(thumbs,st);
    if(st.stage==='done'&&accepted){later(()=>result(st),900);return true;}
    if(st.stage==='expired'){failure('This photo session expired. Please start a new portrait.');return true;}
    if(accepted&&Date.now()-lastChange>STALL_MS){saved();return true;}
  }
  cleanups.push(poll(signal=>api<Status>(`/photobooth/sessions/${s.session_id}`,undefined,undefined,signal),update,800));
}

// ---------- 7. Result ----------
function result(st: Status): void {
  let animated = !!st.animated_url;
  // The backend returns /media/... URLs, relative to the app's own prefix.
  const img = h('img', { class: 'pb-strip', src: withBase((animated ? st.animated_url : st.strip_url) ?? ''), alt: 'Your photo strip' });
  const toggle = st.animated_url
    ? h('button', { class: 'btn ghost', onclick: () => {
        animated = !animated;
        img.src = withBase((animated ? st.animated_url : st.strip_url)!);
        toggle!.textContent = animated ? 'Show still' : 'Show animated';
      } }, 'Show still')
    : null;
  screen(
    header('Greetings, space traveler!', `Your strip is on its way to ${st.email}`),
    h('div', { class: 'pb-split pb-result' },
      img,
      h('div', { class: 'pb-side' },
        h('div', { class: 'panel' },
          h('span', { class: 'panel-tab' }, 'What just happened'),
          h('p', { style: 'margin:0' },
            'A Temporal workflow ran four AI image generations in parallel, retried the ones that failed, composed the strip, and emailed it. If the network had dropped, it would have picked up where it left off.')),
        h('p', { class: 'pb-wfid' }, 'workflow ', workflowRef(st.workflow_id, st.temporal_ui_url)),
        h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          toggle,
          h('button', { class: 'btn mint big', style: 'flex:1', onclick: reset }, 'Done')),
      ),
    ),
  );
}

function failure(e: unknown): void {
  console.error(e);
  screen(
    header('Transporter malfunction', 'We couldn’t save your photo. Please ask a crew member for help.'),
    h('p', { class: 'pb-error', role:'alert' }, e instanceof ApiError ? e.message : 'The photo service could not be reached. Please try again.'),
    photo ? h('button',{class:'btn mint big',onclick:()=>void submit()},'Try again') : null,
    h('button', { class: 'btn amber big', onclick: reset }, 'Start over'),
  );
}

void attract();
