/**
 * A 22-second demo of Nomos. Six acts, cut to 30fps:
 *
 *   0.0–2.5s   Hero: ν glyph, "Nomos", tagline
 *   2.5–8.5s   Code reveals line by line — French non-compete
 *   8.5–12.5s  Scenario 1: Employee · fair terms  →  ENFORCEABLE
 *   12.5–16.5s Scenario 2: Consumer role  →  override fires  →  NOT ENFORCEABLE
 *   16.5–20.5s Proof tree: operand values surfaced on the failing requirement
 *   20.5–22.0s CTA: github.com/sboghossian/nomos + nomos-lang.dev
 *
 * Palette matches the website: cream #FAF8F3, ink #1A1A1A, forest #2D5016,
 * rule #E8E3D8. Typography: Fraunces (serif), Inter (sans), JetBrains Mono.
 */

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

// ─── Shared palette ────────────────────────────────────────────────────────
const C = {
  cream: "#FAF8F3",
  ink: "#1A1A1A",
  sub: "#4A4A4A",
  mute: "#7A7A6E",
  rule: "#E8E3D8",
  accent: "#2D5016",
  accentSoft: "#5A7D3A",
  accentBg: "#EEF1E8",
  red: "#8B1A1A",
  white: "#FFFFFF",
};

const FONT_SERIF = "Fraunces, Georgia, serif";
const FONT_SANS = "Inter, -apple-system, sans-serif";
const FONT_MONO = "JetBrains Mono, Menlo, monospace";

// ─── Reusable: small chip ─────────────────────────────────────────────────
const Chip: React.FC<{ text: string; accent?: boolean }> = ({
  text,
  accent,
}) => (
  <span
    style={{
      fontFamily: FONT_MONO,
      fontSize: 20,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      padding: "8px 16px",
      border: `1px solid ${accent ? C.accentSoft : C.rule}`,
      color: accent ? C.accent : C.sub,
      backgroundColor: accent ? C.accentBg : "transparent",
      borderRadius: 2,
    }}
  >
    {text}
  </span>
);

// ═════════════════════════════════════════════════════════════════════════
// Act 1 — Hero
// ═════════════════════════════════════════════════════════════════════════
const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const glyphOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const glyphScale = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const wordOpacity = interpolate(frame, [18, 34], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [40, 60], [18, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.cream,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 28,
          transform: `scale(${glyphScale})`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 220,
            fontWeight: 500,
            color: C.accent,
            opacity: glyphOpacity,
            lineHeight: 0.9,
          }}
        >
          ν
        </span>
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 160,
            fontWeight: 500,
            color: C.ink,
            opacity: wordOpacity,
            letterSpacing: "-0.02em",
            lineHeight: 0.9,
          }}
        >
          Nomos
        </span>
      </div>
      <p
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 44,
          fontWeight: 400,
          color: C.sub,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          maxWidth: 1100,
          textAlign: "center",
          lineHeight: 1.35,
          margin: 0,
        }}
      >
        A programming language for
        <em
          style={{
            color: C.accent,
            fontStyle: "italic",
            marginLeft: "0.3em",
          }}
        >
          legal reasoning.
        </em>
      </p>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Act 2 — Code reveal
// ═════════════════════════════════════════════════════════════════════════
const codeLines = [
  { text: "type NonCompete {", color: C.ink },
  { text: "  duration: Duration", color: C.ink },
  { text: "  scope: Geography", color: C.ink },
  { text: "  compensation_pct: Float", color: C.ink },
  { text: "}", color: C.ink },
  { text: "", color: C.ink },
  { text: "rule non_compete_enforceable @ FR from 2016-08-10 {", color: C.ink },
  { text: "  requires clause.duration <= 24.months", color: C.ink },
  { text: "  requires clause.scope is reasonable", color: C.ink },
  { text: "  requires clause.compensation_pct >= 0.30", color: C.ink },
  { text: '  authority: code_du_travail.art("L1121-1")', color: C.sub },
  { text: '  authority: cass_soc(2002-07-10, "00-45135")', color: C.sub },
  { text: "}", color: C.ink },
  { text: "", color: C.ink },
  { text: "query non_compete_enforceable as of 2026-04-18", color: C.accent },
];

// naive syntax coloring for our code sample
function colorize(line: string): React.ReactNode {
  const kw =
    /\b(type|rule|requires|authority|query|fact|from|as|of|is|defeats|priority|when)\b/g;
  const str = /("[^"]*")/g;
  let out: React.ReactNode[] = [];
  let i = 0;
  // very dumb multi-pass: wrap keywords then strings. Good enough for demo.
  const tokens = line.split(
    /(\b(?:type|rule|requires|authority|query|fact|from|as|of|is|defeats|priority|when)\b|"[^"]*"|\b\d+\.\d+\b|\b\d+\b|\b24\.months\b|@ FR|2016-08-10|2026-04-18|<=|>=)/,
  );
  for (const t of tokens) {
    if (!t) continue;
    let color: string = C.ink;
    let weight: number = 400;
    if (
      /^(type|rule|requires|authority|query|fact|from|as|of|is|defeats|priority|when)$/.test(
        t,
      )
    ) {
      color = C.accent;
      weight = 500;
    } else if (/^".*"$/.test(t)) {
      color = C.red;
    } else if (
      /^\d/.test(t) ||
      /^\d{4}-\d{2}-\d{2}$/.test(t) ||
      t === "24.months"
    ) {
      color = C.accentSoft;
    } else if (t === "@ FR") {
      color = C.accentSoft;
      weight = 500;
    }
    out.push(
      <span key={i++} style={{ color, fontWeight: weight }}>
        {t}
      </span>,
    );
  }
  return out;
}

const CodeReveal: React.FC = () => {
  const frame = useCurrentFrame();
  // Reveal one line every ~9 frames
  const visibleLines = Math.min(codeLines.length, Math.floor(frame / 9));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.cream,
        padding: 80,
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 24,
          marginBottom: 40,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: C.mute,
          }}
        >
          contract.nomos
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 22,
            color: C.accent,
          }}
        >
          ●&nbsp;parsed
        </span>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 38,
          lineHeight: 1.5,
          color: C.ink,
          backgroundColor: C.white,
          border: `1px solid ${C.rule}`,
          borderRadius: 4,
          padding: 40,
          minHeight: 700,
          boxShadow: "0 8px 40px -16px rgba(45,80,22,0.2)",
        }}
      >
        {codeLines.slice(0, visibleLines).map((l, i) => {
          const opacity = interpolate(frame - i * 9, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{ opacity, minHeight: 56 }}>
              {l.text ? colorize(l.text) : <span>&nbsp;</span>}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Shared Verdict Card (used in Acts 3, 4, 5)
// ═════════════════════════════════════════════════════════════════════════
type Req = { icon: "✓" | "✗"; clause: string; value: string };

const VerdictCard: React.FC<{
  scenario: string;
  verdict: string;
  verdictColor: string;
  winningRule: string;
  defeated?: string;
  tiebreaker?: string;
  requirements: Req[];
  operandsOnFail?: { expr: string; value: string }[];
}> = ({
  scenario,
  verdict,
  verdictColor,
  winningRule,
  defeated,
  tiebreaker,
  requirements,
  operandsOnFail,
}) => {
  return (
    <div
      style={{
        width: 1200,
        backgroundColor: C.white,
        border: `1px solid ${C.rule}`,
        borderRadius: 2,
        boxShadow: "0 8px 40px -16px rgba(45,80,22,0.2)",
        fontFamily: FONT_SANS,
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "14px 24px",
          borderBottom: `1px solid ${C.rule}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "rgba(250,248,243,0.5)",
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: C.mute,
          }}
        >
          live · non_compete_enforceable
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            color: C.accent,
          }}
        >
          ● running
        </span>
      </div>

      {/* scenario */}
      <div style={{ padding: "24px 28px 8px" }}>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: C.mute,
          }}
        >
          Scenario
        </span>
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: FONT_SERIF,
            fontSize: 32,
            fontWeight: 500,
            color: C.ink,
          }}
        >
          {scenario}
        </p>
      </div>

      {/* verdict */}
      <div
        style={{
          padding: "20px 28px",
          borderTop: `1px solid ${C.rule}`,
          borderBottom: `1px solid ${C.rule}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: C.mute,
          }}
        >
          Verdict
        </span>
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: FONT_SERIF,
            fontSize: 88,
            fontWeight: 500,
            color: verdictColor,
            lineHeight: 1,
          }}
        >
          {verdict}
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: FONT_MONO,
            fontSize: 20,
            color: C.sub,
          }}
        >
          winning rule: <span style={{ color: C.accent }}>{winningRule}</span>
        </p>
        {defeated && (
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: FONT_MONO,
              fontSize: 18,
              color: C.mute,
            }}
          >
            defeated: <span style={{ color: "#B58900" }}>{defeated}</span>
          </p>
        )}
      </div>

      {/* proof */}
      <div style={{ padding: "22px 28px" }}>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: C.mute,
          }}
        >
          Proof chain
        </span>
        <ul
          style={{
            margin: "10px 0 0",
            padding: 0,
            listStyle: "none",
            fontFamily: FONT_MONO,
            fontSize: 22,
            lineHeight: 1.5,
          }}
        >
          {requirements.map((r, i) => (
            <li key={i} style={{ color: C.ink, marginBottom: 6 }}>
              <span
                style={{
                  color: r.icon === "✓" ? C.accent : C.red,
                  marginRight: 12,
                  fontWeight: 700,
                }}
              >
                {r.icon}
              </span>
              <span>{r.clause}</span>
              {r.value && (
                <span style={{ color: C.mute }}>&nbsp;→ {r.value}</span>
              )}
            </li>
          ))}
          {operandsOnFail &&
            operandsOnFail.map((op, i) => (
              <li
                key={`op-${i}`}
                style={{
                  color: C.mute,
                  marginLeft: 44,
                  fontSize: 20,
                }}
              >
                · {op.expr} = {op.value}
              </li>
            ))}
        </ul>
      </div>

      {/* tiebreaker */}
      {tiebreaker && (
        <div
          style={{
            padding: "14px 28px",
            borderTop: `1px solid ${C.rule}`,
            backgroundColor: C.accentBg,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: FONT_SERIF,
              fontStyle: "italic",
              fontSize: 22,
              color: C.accent,
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontStyle: "normal",
                fontSize: 16,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: C.mute,
                marginRight: 14,
              }}
            >
              Tiebreaker
            </span>
            {tiebreaker}
          </p>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Acts 3–5 — Scenario flips
// ═════════════════════════════════════════════════════════════════════════
const Scene: React.FC<{
  heading: string;
  card: React.ReactNode;
}> = ({ heading, card }) => {
  const frame = useCurrentFrame();
  const headOp = interpolate(frame, [0, 14], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cardOp = interpolate(frame, [10, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cardY = interpolate(frame, [10, 28], [30, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.cream,
        padding: 80,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 48,
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 22,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: C.mute,
          opacity: headOp,
        }}
      >
        {heading}
      </span>
      <div
        style={{
          opacity: cardOp,
          transform: `translateY(${cardY}px)`,
        }}
      >
        {card}
      </div>
    </AbsoluteFill>
  );
};

const Act3_Fair: React.FC = () => (
  <Scene
    heading="scenario 01 · employee · fair terms"
    card={
      <VerdictCard
        scenario="Employee · fair terms"
        verdict="ENFORCEABLE"
        verdictColor={C.accent}
        winningRule="non_compete_enforceable"
        requirements={[
          { icon: "✓", clause: "clause.duration <= 24", value: "true" },
          { icon: "✓", clause: "clause.scope is reasonable", value: "true" },
          {
            icon: "✓",
            clause: "clause.compensation_pct >= 0.30",
            value: "true",
          },
        ]}
      />
    }
  />
);

const Act4_Consumer: React.FC = () => (
  <Scene
    heading="scenario 02 · consumer role · defeater fires"
    card={
      <VerdictCard
        scenario="Consumer role · consumer_protection_override wins"
        verdict="NOT ENFORCEABLE"
        verdictColor={C.red}
        winningRule="consumer_protection_override"
        defeated="non_compete_enforceable"
        tiebreaker="decided by priority — consumer_protection_override (100) beats non_compete_enforceable (0)."
        requirements={[
          { icon: "✓", clause: "non_compete_enforceable", value: "satisfied" },
          {
            icon: "✓",
            clause: "consumer_protection_override",
            value: "satisfied",
          },
        ]}
      />
    }
  />
);

const Act5_Underpaid: React.FC = () => (
  <Scene
    heading="scenario 03 · underpaid (12%) · base rule fails"
    card={
      <VerdictCard
        scenario="Underpaid employee · 12% compensation"
        verdict="NOT ENFORCEABLE"
        verdictColor={C.red}
        winningRule="— (no rule fired)"
        requirements={[
          { icon: "✓", clause: "clause.duration <= 24", value: "true" },
          { icon: "✓", clause: "clause.scope is reasonable", value: "true" },
          {
            icon: "✗",
            clause: "clause.compensation_pct >= 0.30",
            value: "false",
          },
        ]}
        operandsOnFail={[
          { expr: "clause.compensation_pct", value: "0.12" },
          { expr: "0.30", value: "0.30" },
        ]}
      />
    }
  />
);

// ═════════════════════════════════════════════════════════════════════════
// Act 6 — CTA
// ═════════════════════════════════════════════════════════════════════════
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 16], [0, 1], {
    extrapolateRight: "clamp",
  });
  const yLift = interpolate(frame, [0, 20], [18, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.cream,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
        opacity: fade,
        transform: `translateY(${yLift}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 120,
            fontWeight: 500,
            color: C.accent,
            lineHeight: 0.9,
          }}
        >
          ν
        </span>
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 96,
            fontWeight: 500,
            color: C.ink,
            lineHeight: 0.9,
          }}
        >
          Nomos
        </span>
      </div>
      <p
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 38,
          color: C.sub,
          margin: 0,
          textAlign: "center",
          maxWidth: 1200,
          lineHeight: 1.4,
        }}
      >
        Typed rules. Defeasible logic. LLM bridges.
        <br />
        Proof trees back to statutes.
      </p>
      <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
        <Chip text="nomos-lang.dev" accent />
        <Chip text="github.com/sboghossian/nomos" />
        <Chip text="Apache-2.0 · v0.1.0" />
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Root composition: stitches the acts with Sequences
// ═════════════════════════════════════════════════════════════════════════
export const NomosDemo: React.FC = () => {
  const { fps } = useVideoConfig();
  const s = (sec: number) => Math.round(sec * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: C.cream }}>
      <Sequence from={s(0)} durationInFrames={s(2.5)}>
        <Hero />
      </Sequence>
      <Sequence from={s(2.5)} durationInFrames={s(6)}>
        <CodeReveal />
      </Sequence>
      <Sequence from={s(8.5)} durationInFrames={s(4)}>
        <Act3_Fair />
      </Sequence>
      <Sequence from={s(12.5)} durationInFrames={s(4)}>
        <Act4_Consumer />
      </Sequence>
      <Sequence from={s(16.5)} durationInFrames={s(4)}>
        <Act5_Underpaid />
      </Sequence>
      <Sequence from={s(20.5)} durationInFrames={s(1.5)}>
        <CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
