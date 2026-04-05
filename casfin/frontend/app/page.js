"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const INTRO_FADE_MS = 800;
const LANDING_EXIT_MS = 950;

export default function HomePage() {
  const router = useRouter();
  const introVideoRef = useRef(null);
  const introTimerRef = useRef(null);
  const exitTimerRef = useRef(null);

  const [introFinished, setIntroFinished] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  const [appEntered, setAppEntered] = useState(false);

  useEffect(() => {
    const introVideo = introVideoRef.current;
    if (!introVideo) return undefined;
    introVideo.play().catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    if (!appEntered) document.body.classList.add("landing-lock");
    return () => document.body.classList.remove("landing-lock");
  }, [appEntered]);

  useEffect(() => {
    return () => {
      if (introTimerRef.current) window.clearTimeout(introTimerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  function finishIntro() {
    if (introFinished || introFading) return;
    setIntroFading(true);
    introTimerRef.current = window.setTimeout(() => {
      setIntroFinished(true);
      setIntroFading(false);
      if (introVideoRef.current) introVideoRef.current.pause();
    }, INTRO_FADE_MS);
  }

  function enterApp(route) {
    if (appEntered) return;
    setAppEntered(true);
    exitTimerRef.current = window.setTimeout(() => {
      document.body.classList.remove("landing-lock");
      router.push(route);
    }, LANDING_EXIT_MS);
  }

  return (
    <main className={`landing-page ${appEntered ? "is-exiting" : ""}`}>
      <section className="landing-experience">
        {/* Looping background video */}
        <div className="landing-loop-layer" aria-hidden="true">
          <video autoPlay loop muted playsInline preload="auto" className="landing-video">
            <source src="/videos/casfin-landing-loop.mp4" type="video/mp4" />
          </video>
          <div className="landing-backdrop-gradient" />
        </div>

        {/* Intro animation video */}
        <div className={`video-intro ${introFading || introFinished ? "fade-out" : ""}`}>
          <video
            ref={introVideoRef}
            autoPlay
            muted
            playsInline
            preload="auto"
            className="landing-video"
            onEnded={finishIntro}
          >
            <source src="/videos/casfin-intro.mp4" type="video/mp4" />
          </video>
          <button type="button" className="skip-btn" onClick={finishIntro}>
            Skip
          </button>
        </div>

        {/* Content revealed after intro */}
        <div className={`landing-overlay ${introFinished ? "is-visible" : ""}`}>
          <div className="landing-center-content">
            <div className="landing-actions">
              <button className="land-btn land-btn-primary" onClick={() => enterApp("/casino")} type="button">
                Enter Casino
              </button>
              <button className="land-btn land-btn-secondary" onClick={() => enterApp("/predictions")} type="button">
                Explore Predictions
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
