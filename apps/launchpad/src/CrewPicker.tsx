import './crew.css'

export type Persona = 'Captain' | 'Mech' | 'Envoy' | 'Solarian'

type CrewProfile = {
  name: Persona | 'Space Wizard'
  image: string
  audience: string
  description: string
  stats: readonly [number, number, number, number]
}

// These scores describe the tour's emphasis, not a demo's capabilities or access limits.
const profiles: CrewProfile[] = [
  { name: 'Captain', image: 'captain', audience: 'For executives, managers, decision makers', description: 'You make the call. See how Temporal protects customer experiences and keeps business moving, starting with outcomes.', stats: [1, 5, 2, 2] },
  { name: 'Mech', image: 'mech', audience: 'For developers, architects, hands-on engineers', description: 'Look inside the engine. Explore the Workflow and Activity code, then see how it keeps running when things fail.', stats: [5, 3, 3, 4] },
  { name: 'Envoy', image: 'envoy', audience: 'For DevOps, SRE, platform, and security teams', description: 'Keep the mission running. Trace the system architecture, introduce failures, and follow recovery with Temporal.', stats: [3, 3, 2, 5] },
  { name: 'Solarian', image: 'solarian', audience: 'For marketing, content, creative, and growth teams', description: 'Turn ideas into reliable experiences. Explore how Temporal coordinates AI and customer journeys, starting with business impact.', stats: [1, 5, 3, 1] },
  { name: 'Space Wizard', image: 'space-wizard', audience: 'For builders shipping AI agents on AWS', description: 'Explore the AWS and AI missions. See how agents, models, and cloud services work together with Temporal.', stats: [4, 4, 5, 3] },
]
const statLabels = ['Code on screen', 'Business impact', 'AI exploration', 'Failure testing']

export function CrewPicker({ onPersona, onWizard, onHolodeck }: {
  onPersona: (persona: Persona) => void
  onWizard: () => void
  onHolodeck: () => void
}) {
  return <div className="crew">
    {profiles.map(profile => <button className="crew-card" data-persona={profile.image} key={profile.name} aria-label={`Choose ${profile.name}`} onClick={() => profile.name === 'Space Wizard' ? onWizard() : onPersona(profile.name)}>
      <img className="crew-portrait" src={`/assets/crew/${profile.image}.png`} alt="" />
      <div className="crew-card-content">
        <span className="crew-audience">{profile.audience}</span>
        <strong>{profile.name}</strong>
        <div className="crew-card-details">
          <p>{profile.description}</p>
          <dl className="crew-stats">{statLabels.map((label, index) => <div key={label}>
            <dt>{label}</dt><dd><span className="crew-stat-bars" role="img" aria-label={`${profile.stats[index]} out of 5 emphasis`}>{Array.from({ length: 5 }, (_, pip) => <i key={pip} className={pip < profile.stats[index] ? 'filled' : ''} aria-hidden="true" />)}</span></dd>
          </div>)}</dl>
        </div>
      </div>
    </button>)}
    <button className="crew-holodeck" onClick={onHolodeck}><div><strong>Holodeck</strong><p>Step into the flight simulator or create an AI Photo Booth portrait.</p></div><span className="crew-holodeck-launch">Launch Holodeck ↗</span></button>
    <p className="crew-stat-note">Stats show each tour’s focus. Every crew can explore all four information tabs.</p>
  </div>
}
