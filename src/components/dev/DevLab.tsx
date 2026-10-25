"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MATERIALS_POOL, getMaterial } from "@/data/materials";
import { utcDateString } from "@/lib/daily/date";
import { generatePuzzle, hashString, type DailyPuzzle } from "@/lib/daily/puzzle";
import { resetTutorialSeen } from "@/lib/daily/storage";
import { pieceScale } from "@/lib/game/dailyScale";
import { boundsOf, longestDimension, shapeOutline } from "@/lib/game/geometry";
import { glyph } from "@/lib/game/icon";
import { BUILD_DURATION_S, DAILY_PIECE_COUNT } from "@/lib/physics/constants";
import { DISASTER_NAMES, DISASTER_TYPES } from "@/lib/physics/disasters";
import type { DisasterType } from "@/lib/supabase/types";
import { colors } from "@/lib/theme";
import Button from "@/components/ui/Button";
import Game, { type DevRun } from "@/components/game/Game";
import PieceSvg from "@/components/game/PieceSvg";
import styles from "./DevLab.module.css";

interface Setup {
  itemIds: string[];
  disaster: DisasterType;
  buildSeconds: number;
  seed: number;
  date: string;
}

const STORAGE_KEY = "elevation:dev-setup";
const BUILD_TIMES = [10, 30, BUILD_DURATION_S, 600];
// Below this a piece is hard to see and grab (CONTEXT.md §8, Phase 6 size spread).
const TINY_PX = 8;

const formatSeconds = (s: number) => (s < 60 ? `${s}s` : `${s / 60} min`);

function defaultSetup(): Setup {
  const today = generatePuzzle(utcDateString());
  return { itemIds: today.itemIds, disaster: today.disaster, buildSeconds: BUILD_DURATION_S, seed: 1, date: today.date };
}

// The remembered setup, minus any ids the library no longer has.
function loadSetup(): Setup {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Setup | null;
    if (saved && Array.isArray(saved.itemIds) && DISASTER_TYPES.includes(saved.disaster)) {
      const known = new Set(MATERIALS_POOL.map((m) => m.id));
      return { ...defaultSetup(), ...saved, itemIds: saved.itemIds.filter((id) => known.has(id)) };
    }
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return defaultSetup();
}

function sizeLabel(materialId: string) {
  const b = boundsOf(shapeOutline(getMaterial(materialId).shape, 1));
  const m = (v: number) => (v < 1 ? `${Math.round(v * 100)} cm` : `${v.toFixed(1)} m`);
  return `${m(b.maxX - b.minX)} × ${m(b.maxY - b.minY)}`;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const noSubscribe = () => () => {};

// Dev Lab (/dev): pick any pieces, disaster and build time, then play the run through the
// real game screens. Always practice: nothing is saved or submitted.
export default function DevLab() {
  // Client only: the setup lives in localStorage, which the server render can't read.
  const isClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  return isClient ? <Lab /> : null;
}

function Lab() {
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [run, setRun] = useState<{ dev: DevRun; key: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // Not remembered across reloads; fine.
    }
  }, [setup]);

  const scale = useMemo(() => {
    if (setup.itemIds.length === 0) return null;
    const pxPerMeter = pieceScale(setup.itemIds);
    const px = setup.itemIds.map((id) => longestDimension(shapeOutline(getMaterial(id).shape, 1)) * pxPerMeter);
    return { pxPerMeter, min: Math.min(...px), max: Math.max(...px) };
  }, [setup]);

  const update =(patch: Partial<Setup>) => setSetup({ ...setup, ...patch });

  const start = (startAt: DevRun["startAt"]) => {
    const puzzle: DailyPuzzle = {
      date: setup.date,
      seed: setup.seed.toString(16).padStart(8, "0"),
      seedNumber: setup.seed,
      itemIds: setup.itemIds,
      disaster: setup.disaster,
    };
    setRun({ dev: { puzzle, buildSeconds: setup.buildSeconds, startAt }, key: Date.now() });
  };

  if (run) {
    return (
      <>
        <Game key={run.key} dev={run.dev} />
        <div className={styles.devBar}>
          <span className={styles.devTag}>DEV</span>
          <button type="button" onClick={() => setRun(null)}>
            ← Dev Lab
          </button>
          <button type="button" onClick={() => setRun({ ...run, key: Date.now() })}>
            Restart
          </button>
        </div>
      </>
    );
  }

  const counts = new Map<string, number>();
  for (const id of setup.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const loadDate = (date: string) => {
    const day = generatePuzzle(date);
    update({ itemIds: day.itemIds, disaster: day.disaster, seed: day.seedNumber, date });
  };

  return (
    <div className={styles.lab}>
      <header className={styles.topBar}>
        <p className={styles.brand}>ELEVATION · DEV LAB</p>
        <p className={styles.note}>Practice only: nothing is saved or submitted. Dev builds only.</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>
            Pieces <span className={styles.muted}>({setup.itemIds.length}; the daily set has {DAILY_PIECE_COUNT})</span>
          </h2>
          <div className={styles.row}>
            <button type="button" className={styles.chip} onClick={() => loadDate(utcDateString())}>
              Today
            </button>
            <input
              type="date"
              className={styles.input}
              value={setup.date}
              onChange={(e) => e.target.value && loadDate(e.target.value)}
              aria-label="Load a day's puzzle"
            />
            <button
              type="button"
              className={styles.chip}
              onClick={() => update({ itemIds: shuffled(MATERIALS_POOL.map((m) => m.id)).slice(0, DAILY_PIECE_COUNT) })}
            >
              Random {DAILY_PIECE_COUNT}
            </button>
            <button type="button" className={styles.chip} onClick={() => update({ itemIds: MATERIALS_POOL.map((m) => m.id) })}>
              One of each
            </button>
            <button type="button" className={styles.chip} onClick={() => update({ itemIds: [] })}>
              Clear
            </button>
          </div>
        </div>

        <div className={styles.selected} aria-label="Selected pieces (click to remove)">
          {setup.itemIds.length === 0 && <p className={styles.muted}>Click items below to add them.</p>}
          {setup.itemIds.map((id, i) => (
            <button
              key={i}
              type="button"
              className={styles.slot}
              title={`${getMaterial(id).name}: click to remove`}
              onClick={() => update({ itemIds: setup.itemIds.filter((_, j) => j !== i) })}
            >
              <PieceSvg {...glyph(id)} fill={colors.ink} />
            </button>
          ))}
        </div>
        {scale && (
          <p className={scale.min < TINY_PX ? styles.warn : styles.muted}>
            Scale {scale.pxPerMeter.toFixed(1)} px/m · pieces {scale.min.toFixed(1)}–{scale.max.toFixed(0)} px on the board
            {scale.min < TINY_PX && " · the smallest is hard to see (zoom helps)"}
          </p>
        )}

        <div className={styles.library}>
          {MATERIALS_POOL.map((m) => {
            const n = counts.get(m.id) ?? 0;
            return (
              <button
                key={m.id}
                type="button"
                className={styles.card}
                data-selected={n > 0 || undefined}
                onClick={() => update({ itemIds: [...setup.itemIds, m.id] })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const at = setup.itemIds.lastIndexOf(m.id);
                  if (at >= 0) update({ itemIds: setup.itemIds.filter((_, j) => j !== at) });
                }}
                title="Click to add, right-click to remove one"
              >
                {n > 0 && <span className={styles.count}>×{n}</span>}
                <PieceSvg {...glyph(m.id)} fill={colors.ink} />
                <span className={styles.name}>{m.name}</span>
                <span className={styles.stats}>
                  {sizeLabel(m.id)} · mass {m.mass.toFixed(1)} · μ {m.friction.toFixed(2)}
                </span>
                <span className={styles.stats}>
                  {m.shape.kind}
                  {m.source === "generated" && !m.icon && <span className={styles.warn}> · no icon</span>}
                  {m.fact && ` · size ${m.fact.sizeCheck === "unchecked" ? "unchecked" : `${m.fact.sizeCheck} by search`}`}
                  {m.source === "generated" && !m.fact && <span className={styles.warn}> · no facts</span>}
                </span>
                {m.fact && <span className={styles.fact}>{m.fact.text}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Disaster</h2>
        <div className={styles.row}>
          {DISASTER_TYPES.map((d) => (
            <button
              key={d}
              type="button"
              className={styles.chip}
              data-active={setup.disaster === d || undefined}
              onClick={() => update({ disaster: d })}
            >
              {DISASTER_NAMES[d]}
            </button>
          ))}
          <label className={styles.inline}>
            Seed
            <input
              type="number"
              className={styles.input}
              value={setup.seed}
              min={0}
              onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </label>
          <button
            type="button"
            className={styles.chip}
            onClick={() => update({ seed: hashString(String(Math.random())) })}
            title="Wind direction, meteor spots"
          >
            Random seed
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Build time</h2>
        <div className={styles.row}>
          {BUILD_TIMES.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.chip}
              data-active={setup.buildSeconds === s || undefined}
              onClick={() => update({ buildSeconds: s })}
            >
              {formatSeconds(s)}
              {s === BUILD_DURATION_S && " (daily)"}
            </button>
          ))}
          <span className={styles.muted}>&quot;Start Early&quot; or __elevation.endBuild() also ends the build.</span>
        </div>
      </section>

      <section className={styles.actions}>
        <Button disabled={setup.itemIds.length === 0} onClick={() => start("play")}>
          Play →
        </Button>
        <Button variant="secondary" disabled={setup.itemIds.length === 0} onClick={() => start("intro")}>
          Via intro screen
        </Button>
        <Button variant="secondary" disabled={setup.itemIds.length === 0} onClick={() => start("tutorial")}>
          Via tutorial
        </Button>
        <button type="button" className={styles.link} onClick={resetTutorialSeen}>
          Reset &quot;tutorial seen&quot;
        </button>
      </section>

      <footer className={styles.footer}>
        Console: <code>__elevation</code> (session: debugPieces, endBuild), <code>__view</code> (zoom),{" "}
        <code>__juice</code>, <code>__sound</code>. URL switches on <code>/</code>: <code>?date=</code>,{" "}
        <code>?disaster=</code>, <code>?replay=1</code>.
      </footer>
    </div>
  );
}
