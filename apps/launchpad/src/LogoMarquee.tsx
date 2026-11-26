import logos from './customerLogos.json'

export function LogoMarquee({side}:{side:'top'|'bottom'}) {
  return <div className={`customer-marquee ${side}`} aria-hidden="true"><div className="logo-track">{[0,1].map(copy=><div className="logo-group" key={copy}>{logos.map(name=><img key={name} src={`/assets/brand/customer-logos/${name}`} alt="" />)}</div>)}</div></div>
}
