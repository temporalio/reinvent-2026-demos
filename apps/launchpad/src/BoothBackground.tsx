import './boothBackground.css'

/** Shared decorative frame; it never intercepts touch or alters demo viewports. */
export function BoothBackground() {
  return <div className="booth-background" aria-hidden="true">
    <div className="booth-stars" />
    <img className="booth-grid" src="/assets/frame/perspective-grid.png" alt="" />
    <img className="booth-glow" src="/assets/frame/orange-glow.png" alt="" />
    <svg className="booth-orbit" viewBox="0 0 1000 1800" preserveAspectRatio="none"><path d="M-150 140 C200 0 800 120 1200 400 M-100 1500 C150 1700 600 1840 1200 1950" /></svg>
    <img className="booth-ground" src="/assets/frame/lunar-ground.png" alt="" />
  </div>
}
