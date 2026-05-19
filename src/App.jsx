import React, { useState, useEffect, useRef } from 'react';
import { 
  Timer, Settings, Activity, Cloud, Play, Square, 
  CheckCircle, ListOrdered, Wand2, AlertTriangle, 
  Fuel, ClipboardList, Flag, X, RefreshCw, Clock
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyApqapbww90SRKwLRh-uXg9hiEwuRncTDQ",
  authDomain: "red-burros-racing-pit-wall.firebaseapp.com",
  projectId: "red-burros-racing-pit-wall",
  storageBucket: "red-burros-racing-pit-wall.firebasestorage.app",
  messagingSenderId: "933403633091",
  appId: "1:933403633091:web:13eb28ba3e25985a888976",
  measurementId: "G-9RVFXHFPH1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const activeAppId = "red-burros-endurance-2024";

const formatTime = (s) => {
  if (isNaN(s) || s < 0) return '00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [clientId] = useState(() => Math.random().toString(36).slice(2));
  const [syncStatus, setSyncStatus] = useState('connecting');

  const [isRunning, setIsRunning] = useState(false);
  const [raceTimeLeft, setRaceTimeLeft] = useState(24 * 3600);
  const [fuelTimeLeft, setFuelTimeLeft] = useState(80 * 60);
  const [activeStintTime, setActiveStintTime] = useState(0); 
  const [completedPitStops, setCompletedPitStops] = useState(0);
  
  const [currentDriver, setCurrentDriver] = useState('Ricardo Guedes');
  const [driverSchedule, setDriverSchedule] = useState(['Abel Santos', 'Joao Pinto', 'Daniel Saiao', 'Luis Corte-Real']);
  
  const [trackStatus, setTrackStatus] = useState('GREEN'); 
  const [trackWeather, setTrackWeather] = useState('DRY'); 
  const [raceLogs, setRaceLogs] = useState([]);

  const stateRef = useRef();
  stateRef.current = { 
    raceTimeLeft, fuelTimeLeft, activeStintTime, 
    completedPitStops, currentDriver, driverSchedule, trackStatus, 
    trackWeather, raceLogs, isRunning 
  };

  const pushState = async (overrides = {}) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'artifacts', activeAppId, 'public', 'data', 'race', 'state'), {
        ...stateRef.current, 
        ...overrides, 
        updatedBy: clientId, 
        lastSync: Date.now()
      });
      setSyncStatus('synced');
    } catch (e) { 
      console.error(e);
      setSyncStatus('error'); 
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
        setSyncStatus('error');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    setSyncStatus('connecting');
    
    return onSnapshot(
      doc(db, 'artifacts', activeAppId, 'public', 'data', 'race', 'state'), 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.updatedBy !== clientId) {
            setIsRunning(data.isRunning);
            setCompletedPitStops(data.completedPitStops);
            setCurrentDriver(data.currentDriver);
            setDriverSchedule(data.driverSchedule || []);
            setTrackStatus(data.trackStatus);
            setTrackWeather(data.trackWeather);
            setRaceLogs(data.raceLogs || []);
            const passed = data.isRunning ? Math.floor((Date.now() - data.lastSync) / 1000) : 0;
            setRaceTimeLeft(Math.max(0, data.raceTimeLeft - passed));
            setFuelTimeLeft(Math.max(0, data.fuelTimeLeft - passed));
            setActiveStintTime(data.activeStintTime + passed);
            setSyncStatus('synced');
          }
        } else { 
          pushState(); 
        }
      }, 
      (error) => {
        console.error("Snapshot Error:", error);
        setSyncStatus('error');
      }
    );
  }, [user]);

  useEffect(() => {
    let interval;
    if (isRunning && raceTimeLeft > 0) {
      interval = setInterval(() => {
        setRaceTimeLeft(p => Math.max(0, p - 1));
        setFuelTimeLeft(p => Math.max(0, p - 1));
        setActiveStintTime(p => p + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, raceTimeLeft]);

  const handlePitStop = () => {
    const nextDriver = driverSchedule[0] || '---';
    const log = { id: Date.now(), time: formatTime(raceTimeLeft), msg: `PIT STOP: ${currentDriver} OUT ➔ ${nextDriver} IN`, type: 'info' };
    const newState = {
      completedPitStops: completedPitStops + 1,
      fuelTimeLeft: trackWeather === 'DRY' ? 80 * 60 : 120 * 60,
      activeStintTime: 0,
      currentDriver: nextDriver !== '---' ? nextDriver : currentDriver,
      driverSchedule: driverSchedule.length > 0 ? driverSchedule.slice(1) : [],
      raceLogs: [log, ...raceLogs]
    };
    setCompletedPitStops(newState.completedPitStops);
    setFuelTimeLeft(newState.fuelTimeLeft);
    setActiveStintTime(0);
    setCurrentDriver(newState.currentDriver);
    setDriverSchedule(newState.driverSchedule);
    setRaceLogs(newState.raceLogs);
    pushState(newState);
  };

  const setWeather = (mode) => {
    const newFuel = mode === 'DRY' ? 80 * 60 : 120 * 60;
    const newState = { trackWeather: mode, fuelTimeLeft: newFuel };
    setTrackWeather(mode);
    setFuelTimeLeft(newFuel);
    pushState(newState);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-8 flex flex-col">
      <header className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl">
            <img src="https://i.ibb.co/LdqF6g6/logo-Red-Burros-back-white.png" alt="Logo" className="h-10" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">RED BURROS RACING</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`} />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{syncStatus}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end font-mono">
          <span className="text-[10px] text-slate-500 uppercase font-black">Race Clock</span>
          <span className="text-3xl font-black leading-none">{formatTime(raceTimeLeft)}</span>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        <div className="space-y-6">
          <section className="bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-[10px] text-slate-500 uppercase font-black mb-4">Driver On Track</h2>
            <div className="text-4xl font-black text-white mb-6 truncate">{currentDriver}</div>
            
            <h2 className="text-[10px] text-slate-500 uppercase font-black mb-2">Up Next</h2>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-6 flex items-center justify-center">
                <span className="text-xl font-bold text-blue-400">{driverSchedule[0] || '---'}</span>
            </div>

            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400">Weather Strategy</span>
              <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${trackWeather === 'DRY' ? 'text-amber-500 border-amber-500/50' : 'text-blue-500 border-blue-500/50'}`}>{trackWeather}</span>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-xl">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Pit Stops</h2>
               <span className="text-xl font-black text-blue-500">{completedPitStops}</span>
             </div>
             <button onClick={handlePitStop} className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl transition-all active:scale-95">Perform Pit Stop</button>
          </section>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <section className="bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 sm:p-12 shadow-2xl flex flex-col items-center relative overflow-hidden">
             <div className={`w-full rounded-2xl p-4 border flex flex-col items-center justify-center mb-10 ${fuelTimeLeft <= 300 ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                <span className="text-2xl font-black uppercase tracking-tight">{fuelTimeLeft <= 300 ? "PIT NOW: FUEL LOW" : "PACE: STABLE"}</span>
             </div>
             <h2 className="text-xs text-slate-500 uppercase tracking-[0.5em] font-black mb-4">Fuel Remaining</h2>
             <div className={`text-[8rem] sm:text-[10rem] font-mono font-black tracking-tighter leading-none transition-colors duration-500 ${fuelTimeLeft <= 300 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
               {formatTime(fuelTimeLeft)}
             </div>
             <div className="mt-12 flex gap-4 w-full">
                {!isRunning ? (
                  <button onClick={() => { setIsRunning(true); pushState({isRunning: true}); }} className="flex-1 py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95"><Play className="fill-current w-5 h-5" /> Start Race</button>
                ) : (
                  <div className="flex-1 py-5 bg-slate-950 border border-emerald-500/30 text-emerald-500 rounded-2xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-3 shadow-inner animate-pulse"><Activity className="w-5 h-5" /> Race Active</div>
                )}
                <button onClick={() => { if(window.confirm('Reset Race?')) { window.location.reload(); } }} className="px-10 py-5 bg-slate-800 hover:bg-red-900/40 hover:text-red-400 rounded-2xl font-black uppercase text-xs border border-slate-700">Reset</button>
             </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
             <button onClick={() => setWeather('DRY')} className={`py-4 rounded-xl font-black uppercase text-xs border transition-all ${trackWeather === 'DRY' ? 'bg-amber-600 border-amber-500 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>80m Dry Rule</button>
             <button onClick={() => setWeather('WET')} className={`py-4 rounded-xl font-black uppercase text-xs border transition-all ${trackWeather === 'WET' ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>120m Wet Rule</button>
          </div>
        </div>
      </main>
    </div>
  );
}
