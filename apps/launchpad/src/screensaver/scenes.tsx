import type { ReactNode } from 'react'
import { SCENES, type SceneId } from './content'
import type { ZiggyMood, ZiggyPose } from './Ziggy'

/**
 * Short animated scenes shown between reel rounds. Each scene is a pure
 * function of `step`; the orchestrator walks the steps using SCENE_SCRIPTS
 * (how long each step lasts, and how Ziggy reacts) and flies Ziggy next to
 * whatever element carries `data-focus` in the current step.
 */
export interface SceneBeat {
  ms: number
  mood?: ZiggyMood
  pose?: ZiggyPose
}

export const SCENE_SCRIPTS: Record<SceneId, SceneBeat[]> = {
  durable: [
    { ms: 1700, pose: 'point', mood: 'happy' },
    { ms: 1500, pose: 'point', mood: 'calm' },
    { ms: 1600, pose: 'point', mood: 'calm' },
    { ms: 2400, pose: 'fly', mood: 'wow' },
    { ms: 2200, pose: 'point', mood: 'calm' },
    { ms: 1400, pose: 'point', mood: 'calm' },
    { ms: 2800, pose: 'cheer', mood: 'happy' },
  ],
  agents: [
    { ms: 2600, pose: 'point', mood: 'happy' },
    { ms: 2200, pose: 'point', mood: 'wow' },
    { ms: 1800, pose: 'point', mood: 'calm' },
    { ms: 1700, pose: 'point', mood: 'happy' },
    { ms: 2300, pose: 'fly', mood: 'wow' },
    { ms: 3000, pose: 'cheer', mood: 'happy' },
  ],
  agentcore: [
    { ms: 2600, pose: 'point', mood: 'happy' },
    { ms: 2800, pose: 'point', mood: 'calm' },
    { ms: 2800, pose: 'point', mood: 'calm' },
    { ms: 2800, pose: 'point', mood: 'calm' },
    { ms: 3000, pose: 'cheer', mood: 'happy' },
  ],
}

export function Scene({ id, step }: { id: SceneId; step: number }) {
  if (id === 'durable') return <DurableScene step={step} />
  if (id === 'agents') return <AgentsScene step={step} />
  return <AgentCoreScene step={step} />
}

function Frame({ title, caption, children, alert }: { title: string; caption: string; children: ReactNode; alert?: boolean }) {
  return (
    <div className={`ss-scene ${alert ? 'ss-alert' : ''}`}>
      <div className="ss-scene-title">
        <span className="ss-scene-cap" />
        <h2>{title}</h2>
      </div>
      <div className="ss-scene-body">{children}</div>
      <p key={caption} className="ss-scene-caption">
        {caption}
      </p>
    </div>
  )
}

/* ---------- What Temporal does: a workflow survives a crash and replays ---------- */

type StepState = 'pending' | 'running' | 'done' | 'interrupted' | 'replayed'

function DurableScene({ step }: { step: number }) {
  const sc = SCENES.durable
  const cap = sc.captions[[0, 1, 1, 2, 3, 3, 4][step] ?? 4]
  const states: StepState[] = sc.steps.map((_, i) => {
    if (step === 0) return i === 0 ? 'running' : 'pending'
    if (step === 1) return i === 0 ? 'done' : i === 1 ? 'running' : 'pending'
    if (step === 2) return i < 2 ? 'done' : i === 2 ? 'running' : 'pending'
    if (step === 3) return i < 2 ? 'done' : i === 2 ? 'interrupted' : 'pending'
    if (step === 4) return i < 2 ? 'replayed' : 'pending'
    if (step === 5) return i < 2 ? 'replayed' : i === 2 ? 'running' : 'pending'
    return 'done'
  })
  const focusIdx = [0, 1, 2, 2, 0, 2, 3][step] ?? 3
  const crashed = step === 3
  return (
    <Frame title={sc.title} caption={cap} alert={crashed}>
      <div className="ss-wf">
        {sc.steps.map((name, i) => (
          <div key={name} className="ss-wf-cell">
            {i > 0 && <div className={`ss-wf-link ${states[i - 1] === 'done' || states[i - 1] === 'replayed' ? 'on' : ''}`} />}
            <div
              className={`ss-wf-step is-${states[i]}`}
              data-focus={focusIdx === i ? '1' : undefined}
              data-perch-landscape="below"
            >
              <span className="ss-wf-num">{i + 1}</span>
              <span className="ss-wf-name">{name}</span>
              <span className="ss-wf-state">
                {states[i] === 'done' && '✓ Done'}
                {states[i] === 'running' && 'Running…'}
                {states[i] === 'pending' && 'Waiting'}
                {states[i] === 'interrupted' && '✕ Interrupted'}
                {states[i] === 'replayed' && '↺ Replayed, not re-run'}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className={`ss-worker ${crashed ? 'is-down' : ''}`}>
        <span className="ss-worker-dot" />
        {step < 3 ? 'Worker 1 · online' : crashed ? 'Worker 1 · CRASHED' : 'Worker 2 · online · replaying history'}
      </div>
    </Frame>
  )
}

/* ---------- AI agents: the agent loop as a durable workflow ---------- */

function AgentsScene({ step }: { step: number }) {
  const sc = SCENES.agents
  const cap = sc.captions[[0, 1, 2, 2, 3, 4][step] ?? 4]
  const thinkState = step === 1 ? 'fail' : step === 2 ? 'retry' : step === 3 ? 'ok' : ''
  const crashed = step === 4
  const turns = step >= 5 ? 3 : step >= 3 ? 2 : 1
  return (
    <Frame title={sc.title} caption={cap} alert={crashed}>
      <div className="ss-agent">
        <div className={`ss-loop ${step === 1 || step === 2 || crashed ? 'paused' : ''} ${crashed ? 'is-down' : ''}`}>
          <div className="ss-loop-ring" />
          <div className="ss-loop-orbit">
            <span className="ss-loop-token" />
          </div>
          <div className="ss-loop-label">Agent loop<br /><b>= Workflow</b></div>
          {sc.nodes.map((n, i) => (
            <div
              key={n}
              className={`ss-loop-node n${i} ${i === 0 ? `is-${thinkState}` : ''}`}
              data-focus={(i === 0 && step >= 1 && step <= 3) || (i === 1 && step === 0) ? '1' : undefined}
            >
              <b>{n}</b>
              <span>{sc.nodeSubs[i]}</span>
              {i === 0 && step === 1 && <em className="ss-badge bad">429 Too Many Requests</em>}
              {i === 0 && step === 2 && <em className="ss-badge warn">Retry · attempt 2</em>}
              {i === 0 && step === 3 && <em className="ss-badge good">✓ Succeeded</em>}
            </div>
          ))}
          {crashed && <div className="ss-crash-stamp">Worker crashed</div>}
        </div>
        <div className="ss-context" data-focus={step >= 4 ? '1' : undefined}>
          <div className="ss-context-h">Agent context</div>
          {Array.from({ length: turns }, (_, i) => (
            <div key={i} className="ss-turn">✓ Turn {i + 1}</div>
          ))}
          {step >= 5 && <div className="ss-turn running">… Turn 4</div>}
          <div className={`ss-context-saved ${step >= 4 ? 'on' : ''}`}>
            {step >= 5 ? 'Resumed from event history' : 'Saved in event history'}
          </div>
        </div>
      </div>
    </Frame>
  )
}

/* ---------- Temporal + Amazon Bedrock AgentCore ---------- */

function AgentCoreScene({ step }: { step: number }) {
  const sc = SCENES.agentcore
  const show = (n: number) => (step >= n ? 'on' : '')
  return (
    <Frame title={sc.title} caption={sc.captions[Math.min(step, 4)]}>
      <div className={`ss-ac ${step >= 4 ? 'flowing' : ''}`}>
        <div className="ss-ac-box ss-ac-temporal on" data-focus={step === 0 ? '1' : undefined}>
          <span className="ss-ac-logo" />
          <div>
            <b>Temporal</b>
            <span>Durable orchestration · agent loop = Workflow</span>
          </div>
        </div>
        <div className={`ss-ac-link ${show(1)}`} />
        <div className={`ss-ac-box ss-ac-runtime ${show(1)}`} data-focus={step === 1 ? '1' : undefined}>
          <b>AgentCore Runtime</b>
          <span>Temporal Serverless Workers</span>
          <div className="ss-ac-pads">
            {[0, 1, 2].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.35}s` }} />
            ))}
          </div>
        </div>
        <div className={`ss-ac-fan ${show(2)}`}>
          <div className={`ss-ac-link ${show(2)}`} />
          <div className={`ss-ac-link ${show(3)}`} />
          <div className={`ss-ac-link ${show(3)}`} />
        </div>
        <div className="ss-ac-row">
          <div className={`ss-ac-box small ${show(2)}`} data-focus={step === 2 ? '1' : undefined}>
            <b>Gateway</b>
            <span>Tools · MCP</span>
          </div>
          <div className={`ss-ac-box small ${show(3)}`} data-focus={step === 3 ? '1' : undefined}>
            <b>Memory</b>
            <span>Long-term recall</span>
          </div>
          <div className={`ss-ac-box small ${show(3)}`}>
            <b>Bedrock</b>
            <span>Models</span>
          </div>
        </div>
        {step >= 4 && <div className="ss-ac-punch" data-focus="1">Durable agents on AWS</div>}
      </div>
    </Frame>
  )
}
