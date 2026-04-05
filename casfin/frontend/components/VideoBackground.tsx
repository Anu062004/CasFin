export default function VideoBackground() {
  return (
    <div aria-hidden="true" className="video-background">
      <video autoPlay loop muted playsInline preload="auto" className="video-background-video">
        <source src="/videos/casfin-landing-loop.mp4" type="video/mp4" />
      </video>
      <div className="video-background-overlay" />
    </div>
  );
}
