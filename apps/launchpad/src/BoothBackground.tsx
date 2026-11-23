import './boothBackground.css'

/** Shared Figma backdrop; decorative layers never intercept touch. */
export function BoothBackground() {
  return <div className="booth-background" aria-hidden="true">
    <img className="booth-glow" src="/assets/frame/mission-glow.png" alt="" />
    <img className="booth-stars" src="/assets/frame/figma-stars.png" alt="" />
    <img className="booth-grid" src="/assets/frame/figma-grid.png" alt="" />
    <img className="booth-ground" src="/assets/frame/figma-moon.png" alt="" />
    <div className="booth-orbit"><img src="/assets/frame/mission-orbit.svg" alt="" /></div>
  </div>
}
