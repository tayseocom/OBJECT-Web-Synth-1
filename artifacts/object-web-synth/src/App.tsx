import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Activity, AudioLines, ChevronDown, CircleAlert, CircleStop, KeyboardMusic, Radio, RotateCcw, Sparkles, Waves } from "lucide-react";
import { useSynth, type SynthParams } from "@/hooks/use-synth";
import "./index.css";

const options = {
  exciter: [["pluck", "Guitar Scrape"], ["breath", "Breath"], ["noise", "Noise Burst"], ["pulse", "Pulse"], ["hammer", "Hammer"]],
  body: [["string", "STRING"], ["tube", "TUBE"], ["plate", "PLATE"], ["membrane", "MEMBRANE"]],
};

function SelectField({ value, onChange, items, label, testId }: { value: string; onChange: (value: string) => void; items: string[][]; label: string; testId: string }) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select data-testid={testId} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {items.map(([itemValue, itemLabel]) => <option key={itemValue} value={itemValue}>{itemLabel}</option>)}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  );
}

function Dial({ name, value, onChange }: { name: keyof SynthParams; value: number; onChange: (value: number) => void }) {
  const start = useRef({ y: 0, value: 0 });
  const style = { "--dial-value": value } as CSSProperties;
  return (
    <div className="dial-control">
      <button
        type="button"
        className="dial"
        style={style}
        aria-label={`${name} ${Math.round(value * 100)} percent`}
        data-testid={`dial-${name}`}
        onPointerDown={(event) => { start.current = { y: event.clientY, value }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onChange(start.current.value + (start.current.y - event.clientY) / 130); }}
      >
        <span className="dial-notch" />
      </button>
      <span>{name.toUpperCase()}</span>
    </div>
  );
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, testId, color = "mint" }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void; testId: string; color?: string }) {
  return (
    <label className="slider-row" data-tone={color}>
      <span>{label}</span>
      <input data-testid={testId} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{Math.round((value / max) * 100)}%</output>
    </label>
  );
}

function StartOverlay({ startAudio, error }: { startAudio: () => void; error: string }) {
  return (
    <div className="start-overlay">
      <div className="start-grid" />
      <div className="start-card">
        <div className="eyebrow"><span className="eyebrow-line" /> WSA-INSPIRED / WEB AUDIO</div>
        <div className="start-mark">O</div>
        <h1>OBJECT</h1>
        <p>A performance-first instrument where an exciter transfers energy into a resonant virtual body.</p>
        <button type="button" className="start-button" data-testid="button-start-audio" onPointerDown={startAudio} onClick={startAudio}>
          <AudioLines size={16} /> START AUDIO
        </button>
        {error ? <div className="audio-error" role="alert"><CircleAlert size={14} /> {error}</div> : <div className="start-note">Multitouch keyboard · Web MIDI · pitch bend · pressure · sustain</div>}
      </div>
    </div>
  );
}

function Header({ synth }: { synth: ReturnType<typeof useSynth> }) {
  return (
    <header className="topbar panel-frame">
      <div className="brand-lockup"><div className="brand-symbol">O</div><div><div className="brand-name">OBJECT</div><div className="brand-sub">WSA CONCEPT / WEB</div></div></div>
      <div className="header-mode"><span className="live-dot" /> PERFORMANCE</div>
      <label className="preset-picker">
        <span className="sr-only">Built-in preset</span>
        <select data-testid="select-preset" aria-label="Built-in preset" value={synth.activePreset} onChange={(event) => synth.loadBuiltInPreset(event.target.value)}>
          {synth.builtInPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
          <option value="SAVED PRESET">SAVED PRESET</option>
          <option value="MUTATED">MUTATED</option>
        </select>
        <ChevronDown size={13} aria-hidden="true" />
      </label>
      <button type="button" className="preset-recall" data-testid="button-load-preset" onClick={synth.loadPreset} title="Load your saved local preset"><RotateCcw size={13} /> RECALL</button>
      <div className="header-status">
        <span className={`status-item ${synth.started ? "is-on" : ""}`}><span className="status-led" /> AUDIO</span>
        <span className={`status-item ${synth.midiReady ? "is-on" : ""}`}><span className="status-led" /> MIDI</span>
        <span className="voice-count" data-testid="text-voice-count">{String(synth.voices).padStart(2, "0")} VOICES</span>
      </div>
    </header>
  );
}

function PerformPanel({ synth }: { synth: ReturnType<typeof useSynth> }) {
  const xyRef = useRef<HTMLDivElement>(null);
  const moveXY = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && !event.buttons) return;
    const bounds = xyRef.current?.getBoundingClientRect();
    if (!bounds) return;
    synth.setParam("coupling", (event.clientX - bounds.left) / bounds.width);
    synth.setParam("damping", 1 - (event.clientY - bounds.top) / bounds.height);
  };
  const setOctave = (delta: number) => synth.setOctave(synth.octave + delta);
  return (
    <aside className="perform-panel panel-frame">
      <div className="section-kicker">PERFORM <span>01</span></div>
      <div className="macro-grid">
        {(["strike", "pickup", "coupling", "damping"] as const).map((key) => <Dial key={key} name={key} value={synth.params[key]} onChange={(value) => synth.setParam(key, value)} />)}
      </div>
      <div className="section-kicker xy-label">BODY XY <span>COUPLING / DAMPING</span></div>
      <div ref={xyRef} className="xy-pad" tabIndex={0} role="slider" aria-label="Body coupling and damping control" data-testid="control-body-xy" onPointerDown={moveXY} onPointerMove={moveXY}>
        <div className="xy-crosshair x" /><div className="xy-crosshair y" />
        <div className="xy-dot" style={{ left: `${synth.params.coupling * 100}%`, top: `${(1 - synth.params.damping) * 100}%` }} />
        <span className="xy-axis axis-top">COUPLING</span><span className="xy-axis axis-bottom">DAMPING</span>
      </div>
      <div className="button-row three">
        <button type="button" data-testid="button-octave-down" onClick={() => setOctave(-1)}>OCT −</button>
        <button type="button" className="readout-button" data-testid="text-octave">OCT {synth.octave}</button>
        <button type="button" data-testid="button-octave-up" onClick={() => setOctave(1)}>OCT +</button>
      </div>
      <div className="button-row">
        <button type="button" className={`control-button ${synth.motionOn ? "is-on" : ""}`} data-testid="button-motion" onClick={synth.toggleMotion}><Waves size={12} /> MOTION</button>
        <button type="button" className={`control-button ${synth.body2On ? "is-on violet" : ""}`} data-testid="button-body-two" onClick={() => synth.setBody2On(!synth.body2On)}><span className="plus-mark">+</span> BODY 2</button>
      </div>
      <div className="section-kicker motion-label">MOTION <span>MODULATION SOURCE</span></div>
      <div className="select-pair">
        <SelectField label="Motion target" testId="select-motion-target" value={synth.motionTarget} onChange={synth.setMotionTarget} items={[["pickup", "Pickup"], ["strike", "Strike"], ["coupling", "Coupling"]]} />
        <SelectField label="Motion rate" testId="select-motion-rate" value={synth.motionRate} onChange={synth.setMotionRate} items={[["0.08", "Slow"], ["0.22", "Medium"], ["0.55", "Fast"]]} />
      </div>
      <div className="panel-footnote">DRAG MACROS · TOUCH XY · MOVE TO PLAY</div>
    </aside>
  );
}

function ModelPanel({ synth }: { synth: ReturnType<typeof useSynth> }) {
  const [tab, setTab] = useState("body1");
  const modelRef = useRef<HTMLDivElement>(null);
  const setHandle = (event: ReactPointerEvent<HTMLDivElement>, key: "strike" | "pickup") => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const bounds = modelRef.current?.getBoundingClientRect();
      if (bounds) synth.setParam(key, (pointer.clientX - bounds.left) / bounds.width);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const bodyPath = useMemo(() => ({
    string: "M30,78 C280,105 650,105 970,70",
    tube: "M40,55 C300,43 690,43 960,28 L960,122 C690,107 300,107 40,96 Z",
    plate: "M100,35 L900,35 L900,125 L100,125 Z",
    membrane: "M250,80 C250,10 750,10 750,80 C750,150 250,150 250,80 Z",
  })[synth.body1], [synth.body1]);
  const tabs = [["exciter", "EXCITER"], ["body1", "BODY 1"], ["body2", "BODY 2"], ["xy", "COUPLING"], ["motion", "MOTION"], ["chorus", "MOD"]];
  return (
    <main className="model-panel panel-frame">
      <nav className="tabs" aria-label="Instrument sections">
        {tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} data-testid={`tab-${key}`} onClick={() => setTab(key)}>{label}</button>)}
      </nav>
      <div className="model-stage">
        <div className="stage-header">
          <SelectField label="Exciter" testId="select-exciter" value={synth.exciter} onChange={synth.setExciter} items={options.exciter} />
          <SelectField label="Body one" testId="select-body-one" value={synth.body1} onChange={synth.setBody1} items={options.body} />
          <SelectField label="Body two" testId="select-body-two" value={synth.body2} onChange={synth.setBody2} items={[["plate", "PLATE"], ["membrane", "MEMBRANE"], ["string", "STRING"], ["tube", "TUBE"]]} />
        </div>
        <div className="energy-orbit orbit-a" /><div className="energy-orbit orbit-b" />
        <div ref={modelRef} className="resonator-model">
          <svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-label={`${synth.body1} resonator`} role="img">
            <path d={bodyPath} fill="none" stroke="currentColor" strokeWidth="2" className="body-path" />
            <path d={bodyPath} fill="none" stroke="var(--violet)" strokeWidth="8" opacity=".14" className="energy-path" />
          </svg>
          <div className="handle strike-handle" data-testid="handle-strike" style={{ left: `${8 + 84 * synth.params.strike}%` }} onPointerDown={(event) => setHandle(event, "strike")}><span>STRIKE</span></div>
          <div className="handle pickup-handle" data-testid="handle-pickup" style={{ left: `${8 + 84 * synth.params.pickup}%` }} onPointerDown={(event) => setHandle(event, "pickup")}><span>PICKUP</span></div>
        </div>
        <div className={`coupler-line ${synth.body2On ? "" : "hidden"}`} />
        <div className={`second-body ${synth.body2On ? "" : "hidden"}`}><svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d="M80,50 C300,20 700,80 920,50" fill="none" stroke="var(--violet)" strokeWidth="2" /></svg><span>BODY 2 / {synth.body2.toUpperCase()}</span></div>
        <div className="parameter-ribbon">
          {(["strike", "pickup", "coupling", "damping"] as const).map((key) => <div className="parameter" key={key}><small>{key.toUpperCase()}</small><strong data-testid={`text-param-${key}`}>{key === "coupling" ? synth.params[key].toFixed(2) : `${Math.round(synth.params[key] * 100)}%`}</strong></div>)}
          <div className="parameter"><small>TRACK</small><strong>{Math.round(synth.params.tracking * 100)}%</strong></div><div className="parameter"><small>SPREAD</small><strong>{Math.round(synth.params.spread * 100)}%</strong></div><div className="parameter"><small>EDGE</small><strong>{Math.round(synth.params.edge * 100)}%</strong></div>
        </div>
      </div>
      <div className="info-strip">
        <div><b>EXCITER</b><span>{options.exciter.find(([value]) => value === synth.exciter)?.[1]}</span></div>
        <div><b>BODY</b><span>{synth.body1}</span></div>
        <div><b>MATERIAL</b><span>Glass / steel</span></div>
        <Slider label="TRACKING" value={synth.params.tracking} onChange={(value) => synth.setParam("tracking", value)} testId="range-tracking" />
        <Slider label="STEREO" value={synth.params.spread} onChange={(value) => synth.setParam("spread", value)} testId="range-spread" />
        <Slider label="EDGE" value={synth.params.edge} onChange={(value) => synth.setParam("edge", value)} testId="range-edge" />
      </div>
    </main>
  );
}

function RackPanel({ synth }: { synth: ReturnType<typeof useSynth> }) {
  const meterWidth = Math.min(100, synth.voices * 12);
  return (
    <aside className="rack-panel panel-frame">
      <div className="rack-heading">PLAY <span>02</span></div>
      <div className="select-pair">
        <SelectField label="Polyphony" testId="select-polyphony" value={synth.poly} onChange={synth.setPoly} items={[["8", "POLY 8"], ["12", "POLY 12"], ["16", "POLY 16"]]} />
        <SelectField label="Play mode" testId="select-play-mode" value={synth.mode} onChange={synth.setMode} items={[["Poly", "Poly"], ["Mono", "Mono"]]} />
      </div>
      <div className="output-block"><div className="section-kicker">OUTPUT <span>{String(synth.voices).padStart(2, "0")} ACTIVE</span></div><div className="meter"><i style={{ width: `${meterWidth}%` }} /></div><div className="meter-scale"><span>−∞</span><span>−12</span><span>0</span></div></div>
      <div className="rack-heading fx-heading">FX RACK <span>03</span></div>
      <div className="fx-list">
        <Slider label="ENSEMBLE" value={synth.fx.chorus} max={0.6} onChange={(value) => synth.setFx((current) => ({ ...current, chorus: value }))} testId="range-ensemble" />
        <Slider label="DELAY" value={synth.fx.delay} max={0.65} onChange={(value) => synth.setFx((current) => ({ ...current, delay: value }))} testId="range-delay" color="amber" />
        <Slider label="SPACE" value={synth.fx.space} max={0.65} onChange={(value) => synth.setFx((current) => ({ ...current, space: value }))} testId="range-space" color="violet" />
      </div>
      <div className="rack-heading midi-heading">MIDI <span>{synth.midiReady ? "CONNECTED" : "OPTIONAL"}</span></div>
      <button type="button" className={`learn-button ${synth.midiLearn ? "is-on" : ""}`} data-testid="button-midi-learn" onClick={synth.armMidiLearn}><Radio size={13} /> {synth.midiLearn ? "MOVE A MIDI CONTROL…" : synth.learnedCC ? `CC ${synth.learnedCC} → BODY` : "MIDI LEARN: BODY"}</button>
      <div className="button-row rack-buttons"><button type="button" data-testid="button-save-preset" onClick={synth.savePreset}>SAVE</button><button type="button" className="mutate-button" data-testid="button-mutate" onClick={synth.randomise}><Sparkles size={12} /> MUTATE</button></div>
      <div className="rack-note"><Activity size={12} /> CC 1 / CC 74 · PITCH BEND ±2 ST</div>
    </aside>
  );
}

const whites = [0, 2, 4, 5, 7, 9, 11];
const blackAfter: Record<number, number> = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 };

function PerformanceKeyboard({ synth }: { synth: ReturnType<typeof useSynth> }) {
  const pointerNotes = useRef(new Map<number, { note: number; id: string; element: HTMLElement }>());
  const keyboardRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(new Set<number>());
  const setPressedNote = (note: number, on: boolean) => setPressed((current) => { const next = new Set(current); if (on) next.add(note); else next.delete(note); return next; });
  const resolveKey = (event: ReactPointerEvent<HTMLDivElement>) => document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-note]");
  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = resolveKey(event); if (!target) return;
    const note = Number(target.dataset.note); const old = pointerNotes.current.get(event.pointerId);
    if (old?.note === note) return;
    if (old) { setPressedNote(old.note, false); synth.pointerUp(old.id); }
    const bounds = target.getBoundingClientRect();
    const velocity = Math.max(0.12, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const id = `p${event.pointerId}`;
    pointerNotes.current.set(event.pointerId, { note, id, element: target });
    setPressedNote(note, true); synth.pointerDown(id, note, velocity);
  };
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    const old = pointerNotes.current.get(event.pointerId); if (!old) return;
    setPressedNote(old.note, false); synth.pointerUp(old.id); pointerNotes.current.delete(event.pointerId);
  };
  const base = 48 + synth.octave * 12;
  const whiteKeys = Array.from({ length: 16 }, (_, index) => { const degree = index % 7; const octavePart = Math.floor(index / 7); return { note: base + octavePart * 12 + whites[degree], index }; });
  const blackKeys = Array.from({ length: 15 }, (_, index) => { const degree = index % 7; const noteOffset = blackAfter[degree]; return noteOffset === undefined ? null : { note: base + Math.floor(index / 7) * 12 + noteOffset, index }; }).filter(Boolean) as { note: number; index: number }[];
  const isOn = (note: number) => pressed.has(note) || synth.activeNotes.has(note);
  return (
    <section className="keyboard-panel panel-frame">
      <div className="keyboard-side">
        <button type="button" className={synth.hold ? "is-on" : ""} data-testid="button-hold" onClick={synth.toggleHold}><span>HOLD</span><small>latched</small></button>
        <button type="button" className={synth.sustain ? "is-on" : ""} data-testid="button-sustain" onClick={synth.toggleSustain}><span>SUS</span><small>pedal</small></button>
        <button type="button" className="panic-button" data-testid="button-panic" onClick={synth.panic}><CircleStop size={13} /><small>PANIC</small></button>
      </div>
      <div ref={keyboardRef} className="keyboard" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); press(event); }} onPointerMove={press} onPointerUp={release} onPointerCancel={release}>
        {whiteKeys.map(({ note, index }) => <div key={`w-${note}`} className={`white-key ${isOn(note) ? "is-on" : ""}`} style={{ left: `${(index / 16) * 100}%`, width: `${100 / 16}%` }} data-note={note} data-testid={`key-white-${note}`}><span>{index % 7 === 0 ? `C${Math.floor(note / 12) - 1}` : ""}</span></div>)}
        {blackKeys.map(({ note, index }) => <div key={`b-${note}`} className={`black-key ${isOn(note) ? "is-on" : ""}`} style={{ left: `${((index + 1) / 16 - (0.29 / 16)) * 100}%`, width: `${(0.58 / 16) * 100}%` }} data-note={note} data-testid={`key-black-${note}`} />)}
        <div className="keyboard-tip"><KeyboardMusic size={12} /> Y = velocity · slide between keys · multitouch</div>
      </div>
    </section>
  );
}

function App() {
  const synth = useSynth();
  return (
    <div className="synth-app">
      {!synth.started && <StartOverlay startAudio={synth.startAudio} error={synth.audioError} />}
      <Header synth={synth} />
      <section className="workspace">
        <PerformPanel synth={synth} />
        <ModelPanel synth={synth} />
        <RackPanel synth={synth} />
      </section>
      <PerformanceKeyboard synth={synth} />
      {synth.toast && <div className="toast-message" role="status" data-testid="status-toast">{synth.toast}</div>}
      <div className="app-corner-mark">OBJECT / 01 <span>PHYSICAL MODEL LAB</span></div>
    </div>
  );
}

export default App;