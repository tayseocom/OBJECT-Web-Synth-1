import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SynthParams = {
  strike: number;
  pickup: number;
  coupling: number;
  damping: number;
  tracking: number;
  spread: number;
  edge: number;
};

type Voice = {
  note: number;
  node: AudioNode;
  amp: GainNode;
  source?: AudioBufferSourceNode | OscillatorNode;
  fallback?: boolean;
  state?: { active: boolean };
  released: boolean;
};

type PresetState = SynthParams & {
  exciter: string;
  body1: string;
  body2: string;
  body2On: boolean;
  poly: string;
  mode: string;
  chorus: string;
  delay: string;
  space: string;
  motionTarget: string;
  motionRate: string;
};

const DEFAULT_PARAMS: SynthParams = {
  strike: 0.24,
  pickup: 0.76,
  coupling: 0.57,
  damping: 0.31,
  tracking: 1,
  spread: 0.18,
  edge: 0.12,
};

const WORKLET_SOURCE = `
class FD{constructor(n=96000){this.b=new Float32Array(n);this.w=0;this.n=n}read(d){let p=this.w-d;while(p<0)p+=this.n;let i=Math.floor(p),f=p-i,im1=(i-1+this.n)%this.n,i1=(i+1)%this.n,i2=(i+2)%this.n,y0=this.b[im1],y1=this.b[i],y2=this.b[i1],y3=this.b[i2],a0=-.5*y0+1.5*y1-1.5*y2+.5*y3,a1=y0-2.5*y1+2*y2-.5*y3,a2=-.5*y0+.5*y2,a3=y1;return((a0*f+a1)*f+a2)*f+a3}write(x){this.b[this.w]=x;this.w=(this.w+1)%this.n}}
class Modal{constructor(sr,type){this.sr=sr;this.type=type;this.y=new Float32Array(8);this.y1=new Float32Array(8)}process(x,f,damp,pos){let ratios=this.type==='plate'?[1,1.59,2.14,2.92,3.76,4.68,5.7,6.8]:[1,1.48,2.01,2.63,3.31,4.12,5.05,6.1],o=0;for(let k=0;k<ratios.length;k++){let hz=Math.min(this.sr*.44,f*ratios[k]),r=Math.exp(-Math.PI*hz/(this.sr*(10+(1-damp)*55))),c=2*r*Math.cos(2*Math.PI*hz/this.sr),spatial=Math.sin(Math.PI*(k+1)*Math.max(.03,Math.min(.97,pos))),yn=x*spatial+c*this.y[k]-r*r*this.y1[k];this.y1[k]=this.y[k];this.y[k]=yn;o+=yn*(.38/(1+k*.7))}return o}}
class ObjectVoice extends AudioWorkletProcessor{static get parameterDescriptors(){return['frequency','strike','pickup','coupling','damping','tracking','spread','edge','gate','body2mix'].map(name=>({name,defaultValue:name==='frequency'?220:name==='strike'?.24:name==='pickup'?.76:name==='coupling'?.57:name==='damping'?.31:name==='tracking'?1:name==='spread'?.18:name==='edge'?.12:name==='gate'?1:0,minValue:name==='frequency'?20:0,maxValue:name==='frequency'?18000:1,automationRate:name==='frequency'?'a-rate':'k-rate'}))}constructor(o){super();this.type=o.processorOptions.body1;this.type2=o.processorOptions.body2||'plate';this.d1=new FD;this.d2=new FD;this.lp1=0;this.lp2=0;this.m1=new Modal(sampleRate,this.type);this.m2=new Modal(sampleRate,this.type2);this.lastL=0}wv(d,x,delay,damp,edge,which){let y=d.read(delay);if(which===1){this.lp1+=(y-this.lp1)*(.05+.65*(1-damp));y=this.lp1}else{this.lp2+=(y-this.lp2)*(.05+.65*(1-damp));y=this.lp2}y=Math.tanh(y*(1+edge*2.8))/(1+edge*.35);d.write(x+y*(.985-damp*.18));return y}process(ins,outs,p){let input=ins[0]?.[0],L=outs[0][0],R=outs[0][1]||L;for(let i=0;i<L.length;i++){let mf=p.frequency.length>1?p.frequency[i]:p.frequency[0],tracking=p.tracking[0],f=220+(mf-220)*tracking,strike=p.strike[0],pickup=p.pickup[0],couple=p.coupling[0],damp=p.damping[0],spread=p.spread[0],edge=p.edge[0],gate=p.gate[0],mix2=p.body2mix[0],x=(input?input[i]:0)*(0.7+couple*.65),delay=Math.max(2,sampleRate/f),a=0,b=0;if(this.type==='string'||this.type==='tube'){let dd=this.type==='tube'?delay*.5:delay;a=this.wv(this.d1,x,dd,damp,edge,1);let pick=this.d1.read(Math.max(1.1,dd*(.08+.84*pickup)));a-=this.d1.read(Math.max(1.1,dd*(.08+.84*strike)))*.22;a=.55*a+.7*pick}else a=this.m1.process(x,f,damp,pickup);if(mix2>.001){let feed=x+a*couple*.42;if(this.type2==='string'||this.type2==='tube')b=this.wv(this.d2,feed,this.type2==='tube'?delay*.75:delay*1.35,Math.min(.95,damp+.08),edge,2);else b=this.m2.process(feed,f*.67,Math.min(.95,damp+.05),strike);a=a*(1-mix2*.35)+b*mix2}let side=(a-this.lastL)*spread*.8;this.lastL=a;L[i]=(a+side)*.62*gate;R[i]=(a-side)*.62*gate}return true}}
registerProcessor('object-voice',ObjectVoice);`;

const shapes: Record<string, string> = {
  string: "M30,78 C280,105 650,105 970,70",
  tube: "M40,55 C300,43 690,43 960,28 L960,122 C690,107 300,107 40,96 Z",
  plate: "M100,35 L900,35 L900,125 L100,125 Z",
  membrane: "M250,80 C250,10 750,10 750,80 C750,150 250,150 250,80 Z",
};

const midiKeyMap: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };

function getAudioContext(): typeof AudioContext | undefined {
  const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return win.AudioContext || win.webkitAudioContext;
}

export function useSynth() {
  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  const [started, setStarted] = useState(false);
  const [audioWorkletReady, setAudioWorkletReady] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [voices, setVoices] = useState(0);
  const [midiReady, setMidiReady] = useState(false);
  const [midiLearn, setMidiLearn] = useState(false);
  const [learnedCC, setLearnedCC] = useState<number | null>(null);
  const [octave, setOctave] = useState(0);
  const [hold, setHold] = useState(false);
  const [sustain, setSustain] = useState(false);
  const [body2On, setBody2On] = useState(false);
  const [motionOn, setMotionOn] = useState(false);
  const [motionTarget, setMotionTarget] = useState("pickup");
  const [motionRate, setMotionRate] = useState("0.22");
  const [exciter, setExciter] = useState("pluck");
  const [body1, setBody1] = useState("string");
  const [body2, setBody2] = useState("plate");
  const [poly, setPoly] = useState("12");
  const [mode, setMode] = useState("Poly");
  const [fx, setFx] = useState({ chorus: 0.15, delay: 0.16, space: 0.22 });
  const [activeVoices, setActiveVoices] = useState<Record<string, number>>({});
  const [toast, setToast] = useState("");

  const paramsRef = useRef(params);
  const ctxRef = useRef<AudioContext | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);
  const spaceWetRef = useRef<GainNode | null>(null);
  const chorusWetRef = useRef<GainNode | null>(null);
  const voicesRef = useRef(new Map<string, Voice>());
  const sustainedRef = useRef(new Set<string>());
  const heldRef = useRef(new Set<string>());
  const pitchBendRef = useRef(0);
  const pressureRef = useRef(0);
  const startedRef = useRef(false);
  const workletRef = useRef(false);
  const octaveRef = useRef(0);
  const sustainRef = useRef(false);
  const holdRef = useRef(false);
  const selectionsRef = useRef({ exciter, body1, body2, body2On });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionFrame = useRef<number | null>(null);
  const downKeys = useRef(new Set<string>());
  const midiRef = useRef<MIDIAccess | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { octaveRef.current = octave; }, [octave]);
  useEffect(() => { sustainRef.current = sustain; }, [sustain]);
  useEffect(() => { holdRef.current = hold; }, [hold]);
  useEffect(() => { selectionsRef.current = { exciter, body1, body2, body2On }; }, [exciter, body1, body2, body2On]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1700);
  }, []);

  const updateVoiceCount = useCallback(() => setVoices(voicesRef.current.size), []);

  const setActive = useCallback((id: string, note?: number) => {
    setActiveVoices((current) => {
      const next = { ...current };
      if (note === undefined) delete next[id]; else next[id] = note;
      return next;
    });
  }, []);

  const hardStop = useCallback((id: string) => {
    const voice = voicesRef.current.get(id);
    if (!voice) return;
    if (voice.fallback && voice.state) voice.state.active = false;
    try { voice.source?.stop(); } catch { /* already ended */ }
    try { voice.node.disconnect(); voice.amp.disconnect(); } catch { /* disconnected */ }
    voicesRef.current.delete(id);
    sustainedRef.current.delete(id);
    heldRef.current.delete(id);
    setActive(id);
    updateVoiceCount();
  }, [setActive, updateVoiceCount]);

  const midiFrequency = useCallback((note: number) => 440 * Math.pow(2, (note - 69 + pitchBendRef.current) / 12), []);

  const updateVoiceParams = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const current = paramsRef.current;
    for (const voice of voicesRef.current.values()) {
      if (voice.fallback) continue;
      const node = voice.node as AudioWorkletNode;
      for (const key of ["strike", "pickup", "coupling", "damping", "tracking", "spread", "edge"]) {
        node.parameters.get(key)?.setTargetAtTime(current[key as keyof SynthParams], ctx.currentTime, 0.02);
      }
      node.parameters.get("body2mix")?.setTargetAtTime(selectionsRef.current.body2On ? 0.58 : 0, ctx.currentTime, 0.03);
      node.parameters.get("frequency")?.setTargetAtTime(midiFrequency(voice.note), ctx.currentTime, 0.01);
    }
  }, [midiFrequency]);

  const setParam = useCallback((key: keyof SynthParams, value: number) => {
    const nextValue = Math.max(0, Math.min(1, value));
    setParams((current) => ({ ...current, [key]: nextValue }));
    paramsRef.current = { ...paramsRef.current, [key]: nextValue };
    updateVoiceParams();
  }, [updateVoiceParams]);

  const releaseVoice = useCallback((id: string) => {
    const voice = voicesRef.current.get(id);
    const ctx = ctxRef.current;
    if (!voice || !ctx) return;
    if (sustainRef.current) {
      voice.released = true;
      sustainedRef.current.add(id);
      return;
    }
    const now = ctx.currentTime;
    voice.amp.gain.cancelScheduledValues(now);
    voice.amp.gain.setTargetAtTime(0.0001, now, 0.12 + paramsRef.current.damping * 0.25);
    if (voice.fallback && voice.state) voice.state.active = false;
    else (voice.node as AudioWorkletNode).parameters.get("gate")?.setTargetAtTime(0, now, 0.04);
    window.setTimeout(() => hardStop(id), 1800);
    setActive(id);
  }, [hardStop, setActive]);

  const noiseBuffer = useCallback((seconds: number, shape = 2) => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, shape);
    return buffer;
  }, []);

  const excite = useCallback((input: GainNode, frequency: number, velocity: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return undefined;
    const now = ctx.currentTime;
    const type = selectionsRef.current.exciter;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    gain.gain.value = 0.35 * velocity * (0.75 + pressureRef.current * 0.4);
    if (type === "pulse") {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.2 * velocity, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      oscillator.connect(gain).connect(input);
      oscillator.start();
      oscillator.stop(now + 0.07);
      return oscillator;
    }
    const source = ctx.createBufferSource();
    const seconds = type === "breath" ? 0.38 : type === "noise" ? 0.18 : type === "hammer" ? 0.025 : 0.075;
    source.buffer = noiseBuffer(seconds, type === "hammer" ? 5 : 2);
    filter.type = type === "breath" ? "bandpass" : type === "pluck" ? "highpass" : "bandpass";
    filter.frequency.value = type === "breath" ? 1350 : type === "pluck" ? 650 : type === "hammer" ? 3200 : 1900;
    filter.Q.value = type === "breath" ? 1.2 : 0.7;
    source.connect(filter).connect(gain).connect(input);
    source.start();
    return source;
  }, [noiseBuffer]);

  const compatibleVoice = useCallback((note: number, velocity: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    const size = Math.max(4096, Math.ceil(ctx.sampleRate * 2));
    const state = { buffer: new Float32Array(size), write: 0, low: 0, excitation: velocity * 0.65, active: true };
    const node = ctx.createScriptProcessor(512, 0, 2);
    const read = (delay: number) => {
      let at = state.write - delay;
      while (at < 0) at += size;
      const i = Math.floor(at);
      const f = at - i;
      return state.buffer[i] * (1 - f) + state.buffer[(i + 1) % size] * f;
    };
    node.onaudioprocess = (event) => {
      const left = event.outputBuffer.getChannelData(0);
      const right = event.outputBuffer.getChannelData(1);
      const current = paramsRef.current;
      for (let i = 0; i < left.length; i += 1) {
        if (!state.active) { left[i] = 0; right[i] = 0; continue; }
        const frequency = 220 + (midiFrequency(note) - 220) * current.tracking;
        const delay = Math.max(2, Math.min(size - 3, ctx.sampleRate / frequency * (selectionsRef.current.body1 === "tube" ? 0.5 : 1)));
        const loop = read(delay);
        state.low += (loop - state.low) * (0.05 + 0.65 * (1 - current.damping));
        const drive = (Math.random() * 2 - 1) * state.excitation * (0.65 + current.strike * 0.45);
        state.excitation *= selectionsRef.current.body1 === "tube" ? 0.994 : 0.991;
        state.buffer[state.write] = drive + Math.tanh(state.low * (1 + current.edge * 2.8)) * (0.985 - current.damping * 0.18);
        state.write = (state.write + 1) % size;
        const sample = 0.55 * loop + 0.7 * read(Math.max(1, delay * (0.08 + 0.84 * current.pickup)));
        const side = (sample - state.low) * current.spread * 0.35;
        left[i] = (sample + side) * 0.62;
        right[i] = (sample - side) * 0.62;
      }
    };
    return { node, state };
  }, [midiFrequency]);

  const noteOn = useCallback((note: number, velocity = 0.8, id = `m${note}`) => {
    const ctx = ctxRef.current;
    if (!startedRef.current || !ctx) return;
    if (selectionsRef.current.body1 === "none") return;
    if (mode === "Mono") for (const voiceId of [...voicesRef.current.keys()]) hardStop(voiceId);
    if (voicesRef.current.has(id)) hardStop(id);
    const maxVoices = Number(poly);
    if (voicesRef.current.size >= maxVoices) {
      const first = voicesRef.current.keys().next().value as string | undefined;
      if (first) hardStop(first);
    }
    const now = ctx.currentTime;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.015, 0.5 * velocity), now + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.18 * velocity, now + 0.16);
    const current = paramsRef.current;
    let node: AudioNode;
    let source: AudioBufferSourceNode | OscillatorNode | undefined;
    let fallback = false;
    let state: { active: boolean } | undefined;
    if (!workletRef.current) {
      const compatible = compatibleVoice(note, velocity);
      if (!compatible) return;
      node = compatible.node; state = compatible.state; fallback = true;
      node.connect(amp).connect(dryRef.current!);
    } else {
      const input = ctx.createGain();
      const worklet = new AudioWorkletNode(ctx, "object-voice", {
        processorOptions: { body1: selectionsRef.current.body1, body2: selectionsRef.current.body2 },
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      worklet.connect(amp).connect(dryRef.current!);
      input.connect(worklet);
      const parameters = worklet.parameters;
      parameters.get("frequency")!.value = midiFrequency(note);
      for (const key of ["strike", "pickup", "coupling", "damping", "tracking", "spread", "edge"]) parameters.get(key)!.value = current[key as keyof SynthParams];
      parameters.get("body2mix")!.value = selectionsRef.current.body2On ? 0.58 : 0;
      parameters.get("gate")!.value = 1;
      source = excite(input, midiFrequency(note), velocity);
      node = worklet;
    }
    voicesRef.current.set(id, { note, node, amp, source, fallback, state, released: false });
    setActive(id, note);
    updateVoiceCount();
  }, [compatibleVoice, excite, hardStop, mode, midiFrequency, poly, setActive, updateVoiceCount]);

  const endSustain = useCallback(() => {
    sustainRef.current = false;
    setSustain(false);
    for (const id of [...sustainedRef.current]) releaseVoice(id);
    sustainedRef.current.clear();
  }, [releaseVoice]);

  const midiMessage = useCallback((message: MIDIMessageEvent) => {
    const data = message.data;
    if (!data) return;
    const [status, note, value] = data;
    const command = status & 0xf0;
    const channel = status & 0x0f;
    if (command === 0x90 && value) noteOn(note, value / 127, `m${channel}-${note}`);
    else if (command === 0x80 || (command === 0x90 && !value)) releaseVoice(`m${channel}-${note}`);
    else if (command === 0xe0) { pitchBendRef.current = (((value << 7) | note) - 8192) / 8192 * 2; updateVoiceParams(); }
    else if (command === 0xd0) pressureRef.current = note / 127;
    else if (command === 0xb0) {
      if (note === 64) {
        if (value >= 64) { sustainRef.current = true; setSustain(true); }
        else endSustain();
        return;
      }
      if (midiLearn) {
        setMidiLearn(false); setLearnedCC(note); showToast(`CC ${note} ASSIGNED`); return;
      }
      if (note === learnedCC || note === 1) setParam("coupling", value / 127);
      if (note === 74) setParam("damping", 1 - value / 127);
    }
  }, [endSustain, learnedCC, midiLearn, noteOn, releaseVoice, setParam, showToast, updateVoiceParams]);

  const setupMidi = useCallback(async () => {
    const requestMidi = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }).requestMIDIAccess;
    if (!requestMidi) return;
    try {
      const access = await requestMidi.call(navigator);
      const hook = () => {
        for (const input of access.inputs.values()) input.onmidimessage = midiMessage;
      };
      hook();
      access.onstatechange = hook;
      midiRef.current = access;
      setMidiReady(true);
    } catch { setMidiReady(false); }
  }, [midiMessage]);

  const initializeAudio = useCallback(async () => {
    if (startedRef.current) return;
    const AudioContextClass = getAudioContext();
    if (!AudioContextClass) { setAudioError("This browser does not provide Web Audio."); showToast("Web Audio is unavailable in this browser"); return; }
    try {
      const ctx = new AudioContextClass({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      const resumePromise = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      const master = ctx.createGain();
      master.gain.value = 0.72;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 4; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.12;
      const dry = ctx.createGain();
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      const delay = ctx.createDelay(1), delayFeedback = ctx.createGain(), delayWet = ctx.createGain();
      delay.delayTime.value = 0.29; delayFeedback.gain.value = 0.28;
      dry.connect(delay); delay.connect(delayFeedback).connect(delay); delay.connect(delayWet).connect(master);
      const convolver = ctx.createConvolver();
      const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.8), ctx.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.4);
      }
      convolver.buffer = impulse;
      const spaceWet = ctx.createGain(); dry.connect(convolver).connect(spaceWet).connect(master);
      const chorus = ctx.createDelay(0.05), lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      chorus.delayTime.value = 0.018; lfo.frequency.value = 0.27; lfoGain.gain.value = 0.0045; lfo.connect(lfoGain).connect(chorus.delayTime); lfo.start();
      const chorusWet = ctx.createGain(); dry.connect(chorus).connect(chorusWet).connect(master);
      dry.connect(master); master.connect(limiter).connect(analyser).connect(ctx.destination);
      dryRef.current = dry; analyserRef.current = analyser; delayWetRef.current = delayWet; spaceWetRef.current = spaceWet; chorusWetRef.current = chorusWet;
      delayWet.gain.value = fx.delay; spaceWet.gain.value = fx.space; chorusWet.gain.value = fx.chorus;
      await resumePromise;
      startedRef.current = true; setStarted(true); setAudioError("");
      if (ctx.audioWorklet?.addModule) {
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
        try { await ctx.audioWorklet.addModule(url); workletRef.current = true; setAudioWorkletReady(true); }
        catch { workletRef.current = false; setAudioWorkletReady(false); showToast("Audio is on — using compatible engine"); }
        finally { URL.revokeObjectURL(url); }
      } else { setAudioWorkletReady(false); showToast("Audio is on — using compatible engine"); }
      void setupMidi();
    } catch {
      startedRef.current = false; setStarted(false); setAudioError("Audio could not start. Check Silent Mode or output, then try again."); showToast("Audio could not start — check your output");
      try { await ctxRef.current?.close(); } catch { /* noop */ }
      ctxRef.current = null;
    }
  }, [fx.chorus, fx.delay, fx.space, setupMidi, showToast]);

  const startAudio = useCallback(() => {
    if (startedRef.current) return Promise.resolve();
    if (startPromiseRef.current) return startPromiseRef.current;
    const promise = initializeAudio();
    startPromiseRef.current = promise;
    void promise.finally(() => { startPromiseRef.current = null; });
    return promise;
  }, [initializeAudio]);

  useEffect(() => {
    if (chorusWetRef.current) chorusWetRef.current.gain.value = fx.chorus;
    if (delayWetRef.current) delayWetRef.current.gain.value = fx.delay;
    if (spaceWetRef.current) spaceWetRef.current.gain.value = fx.space;
  }, [fx]);

  useEffect(() => {
    const meterLoop = () => {
      if (analyserRef.current) { const bytes = new Uint8Array(analyserRef.current.frequencyBinCount); analyserRef.current.getByteTimeDomainData(bytes); }
      if (startedRef.current) requestAnimationFrame(meterLoop);
    };
    if (started) requestAnimationFrame(meterLoop);
  }, [started]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const note = midiKeyMap[event.key.toLowerCase()];
      if (note === undefined || downKeys.current.has(event.key.toLowerCase())) return;
      downKeys.current.add(event.key.toLowerCase());
      noteOn(note + octaveRef.current * 12, 0.8, `k${event.key.toLowerCase()}`);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (midiKeyMap[key] === undefined) return;
      downKeys.current.delete(key); releaseVoice(`k${key}`);
    };
    const clearInput = () => { for (const id of [...voicesRef.current.keys()]) hardStop(id); downKeys.current.clear(); setActiveVoices({}); };
    const onVisibilityChange = () => { if (document.hidden) clearInput(); };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", clearInput); document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", clearInput); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [hardStop, noteOn, releaseVoice]);

  useEffect(() => () => { if (motionFrame.current) cancelAnimationFrame(motionFrame.current); }, []);

  const toggleSustain = useCallback(() => {
    if (sustainRef.current) endSustain(); else { sustainRef.current = true; setSustain(true); }
  }, [endSustain]);
  const toggleHold = useCallback(() => {
    if (holdRef.current) { holdRef.current = false; setHold(false); for (const id of [...heldRef.current]) releaseVoice(id); heldRef.current.clear(); }
    else { holdRef.current = true; setHold(true); }
  }, [releaseVoice]);
  const panic = useCallback(() => { for (const id of [...voicesRef.current.keys()]) hardStop(id); heldRef.current.clear(); sustainedRef.current.clear(); setActiveVoices({}); showToast("ALL VOICES SILENCED"); }, [hardStop, showToast]);

  const pointerDown = useCallback((id: string, note: number, velocity: number) => { noteOn(note, velocity, id); setActive(id, note); }, [noteOn, setActive]);
  const pointerUp = useCallback((id: string) => {
    if (holdRef.current) { heldRef.current.add(id); setActive(id); } else releaseVoice(id);
  }, [releaseVoice, setActive]);

  const toggleMotion = useCallback(() => {
    setMotionOn((current) => !current);
  }, []);
  useEffect(() => {
    if (!motionOn) { if (motionFrame.current) cancelAnimationFrame(motionFrame.current); return; }
    let phase = 0;
    const loop = () => {
      phase += Number(motionRate) * 0.012;
      const key = motionTarget as keyof SynthParams;
      const base = paramsRef.current[key];
      const depth = key === "coupling" ? 0.28 : 0.18;
      setParam(key, base + Math.sin(phase) * depth);
      motionFrame.current = requestAnimationFrame(loop);
    };
    motionFrame.current = requestAnimationFrame(loop);
    return () => { if (motionFrame.current) cancelAnimationFrame(motionFrame.current); };
  }, [motionOn, motionRate, motionTarget, setParam]);

  const randomise = useCallback(() => {
    (["strike", "pickup", "coupling", "damping"] as const).forEach((key) => setParam(key, 0.08 + Math.random() * 0.84));
    setParam("tracking", 0.35 + Math.random() * 0.65); setParam("spread", Math.random() * 0.55); setParam("edge", Math.random() * 0.45);
    showToast("OBJECT MUTATED");
  }, [setParam, showToast]);

  const savePreset = useCallback(() => {
    const state: PresetState = { ...paramsRef.current, exciter, body1, body2, body2On, poly, mode, chorus: String(fx.chorus), delay: String(fx.delay), space: String(fx.space), motionTarget, motionRate };
    try { localStorage.setItem("objectPreset", JSON.stringify(state)); showToast("PRESET SAVED LOCALLY"); } catch { showToast("PRESET COULD NOT BE SAVED"); }
  }, [body1, body2, body2On, exciter, fx, mode, motionRate, motionTarget, poly, showToast]);

  const loadPreset = useCallback(() => {
    try {
      const raw = localStorage.getItem("objectPreset");
      if (!raw) { showToast("NO SAVED PRESET"); return; }
      const state = JSON.parse(raw) as Partial<PresetState>;
      (Object.keys(DEFAULT_PARAMS) as (keyof SynthParams)[]).forEach((key) => { if (typeof state[key] === "number") setParam(key, state[key]!); });
      if (state.exciter) setExciter(state.exciter); if (state.body1) setBody1(state.body1); if (state.body2) setBody2(state.body2); if (state.poly) setPoly(state.poly); if (state.mode) setMode(state.mode); if (typeof state.body2On === "boolean") setBody2On(state.body2On);
      if (state.chorus) setFx((current) => ({ ...current, chorus: Number(state.chorus) })); if (state.delay) setFx((current) => ({ ...current, delay: Number(state.delay) })); if (state.space) setFx((current) => ({ ...current, space: Number(state.space) }));
      if (state.motionTarget) setMotionTarget(state.motionTarget); if (state.motionRate) setMotionRate(state.motionRate); showToast("PRESET LOADED");
    } catch { showToast("PRESET COULD NOT LOAD"); }
  }, [setParam, showToast]);

  const armMidiLearn = useCallback(() => { setMidiLearn((current) => !current); showToast(midiLearn ? "MIDI LEARN OFF" : "MOVE A MIDI CONTROL"); }, [midiLearn, showToast]);

  const activeNotes = useMemo(() => new Set(Object.values(activeVoices)), [activeVoices]);
  return {
    params, started, audioWorkletReady, audioError, voices, midiReady, midiLearn, learnedCC, octave, hold, sustain, body2On, motionOn, motionTarget, motionRate, exciter, body1, body2, poly, mode, fx, activeNotes, toast,
    startAudio, setParam, setExciter, setBody1, setBody2, setPoly, setMode, setFx, setOctave: (value: number) => setOctave(Math.max(-2, Math.min(2, value))), setBody2On: (value: boolean) => { setBody2On(value); selectionsRef.current.body2On = value; updateVoiceParams(); }, setMotionTarget, setMotionRate,
    toggleSustain, toggleHold, panic, pointerDown, pointerUp, toggleMotion, randomise, savePreset, loadPreset, armMidiLearn, setMidiLearn,
  };
}