import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Timer, Users, Settings, Activity, Cloud, Wind, Play,
  Square, CheckCircle, ListOrdered, Wand2, CloudRain, Sun, 
  CloudLightning, CloudFog, Droplets, MapPin, Flag, ChevronDown,
  ClipboardList, Scale, Fuel, AlertTriangle, Plus, Trash2, X,
  Clock, History, Wrench, CloudOff, RefreshCw
} from 'lucide-react';

// --- Firebase Cloud Architecture ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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
const appId = "red-burros-endurance-2024";

// --- Utilities ---
const formatTime = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatHHMM = (totalSecondsOfDay) => {
  const h = Math.floor(totalSecondsOfDay / 3600) % 24;
  const m = Math.floor((totalSecondsOfDay % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const WeatherIcon = ({ code }) => {
  if (code === 0) return <Sun className="w-5 h-5 text-yellow-400" />;
  if (code <= 3) return <Cloud className="w-5 h-5 text-slate-300" />;
  if (code <= 48) return <CloudFog className="w-5 h-5 text-slate-400" />;
  if (code <= 67) return <CloudRain className="w-5 h-5 text-blue-400" />;
  if (code <= 82) return <Droplets className="w-5 h-5 text-blue-500" />;
  return <CloudLightning className="w-5 h-5 text-purple-400" />;
};

export default function App() {
  // --- Firebase User State ---
  const [user, setUser] = useState(null);
  const [clientId] = useState(() => (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).slice(2));
  const [syncStatus, setSyncStatus] = useState('offline'); // offline, connecting, synced, error

  // --- Standardized Default Race Configuration ---
  const INITIAL_RACE_DURATION = 24 * 3600;
  const INITIAL_START_TIME = { h: 13, m: 0 };
  const INITIAL_MIN_STINT = 10 * 60;
  
  // Fuel & Maintenance Defaults
  const INITIAL_DRY_FUEL = 80 * 60; // 80 minutes
  const INITIAL_WET_FUEL = 120 * 60; // 120 minutes
  
  const INITIAL_HAS_MANDATORY_STOPS = false;
  const INITIAL_PIT_STOPS = 25; // Retained as fallback
  
  const INITIAL_MAINT_STOPS = [
      { id: 1, h: 21, m: 0, active: true },
      { id: 2, h: 6, m: 0, active: true }
  ];
  
  // DRIVER DEFAULTS
  const INITIAL_DRIVERS = [
    { name: 'Ricardo Guedes', weight: 16 },
    { name: 'Abel Santos', weight: 0 },
    { name: 'Joao Pinto', weight: 16 },
    { name: 'Daniel Saiao Ferreira', weight: 12 },
    { name: 'Luis Corte-Real', weight: 0 }
  ];
  
  const [totalRaceDuration, setTotalRaceDuration] = useState(INITIAL_RACE_DURATION);
  const [raceStartTime, setRaceStartTime] = useState(INITIAL_START_TIME);
  const [minStintDuration, setMinStintDuration] = useState(INITIAL_MIN_STINT);
  
  const [hasMandatoryStops, setHasMandatoryStops] = useState(INITIAL_HAS_MANDATORY_STOPS);
  const [requiredPitStops, setRequiredPitStops] = useState(INITIAL_PIT_STOPS);
  
  const [dryFuelMax, setDryFuelMax] = useState(INITIAL_DRY_FUEL);
  const [wetFuelMax, setWetFuelMax] = useState(INITIAL_WET_FUEL);
  const [maintStops, setMaintStops] = useState(INITIAL_MAINT_STOPS);
  
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS);
  const teamName = 'RED BURROS RACING';
  
  // --- Live State ---
  const [isRunning, setIsRunning] = useState(false);
  const [raceTimeLeft, setRaceTimeLeft] = useState(INITIAL_RACE_DURATION);
  const [fuelTimeLeft, setFuelTimeLeft] = useState(INITIAL_DRY_FUEL);
  
  const [activeStintTime, setActiveStintTime] = useState(0); 
  const [completedPitStops, setCompletedPitStops] = useState(0);
  
  const [currentDriver, setCurrentDriver] = useState(INITIAL_DRIVERS[0].name);
  
  const [driverSchedule, setDriverSchedule] = useState(() => {
      const targetLen = INITIAL_HAS_MANDATORY_STOPS ? INITIAL_PIT_STOPS : Math.max(5, Math.ceil(INITIAL_RACE_DURATION / INITIAL_DRY_FUEL) + 2);
      return Array.from({ length: targetLen }, (_, i) => INITIAL_DRIVERS[(i + 1) % INITIAL_DRIVERS.length].name);
  });
  
  const [trackStatus, setTrackStatus] = useState('GREEN'); 
  const [trackWeatherCondition, setTrackWeatherCondition] = useState('DRY'); 
  
  const [driverTotalTimes, setDriverTotalTimes] = useState(() => {
      const times = {};
      INITIAL_DRIVERS.forEach(d => times[d.name] = 0);
      return times;
  });
  const [raceLogs, setRaceLogs] = useState([]); 
  
  // --- Environment ---
  const [locationName, setLocationName] = useState('Eindhoven');
  const [weatherData, setWeatherData] = useState(null);
  const [hourlyForecast, setHourlyForecast] = useState([]);
  const [rainWarningActive, setRainWarningActive] = useState(false);
  
  // --- UI ---
  const [showSettings, setShowSettings] = useState(false);
  const [showRetroPitModal, setShowRetroPitModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [retroPitError, setRetroPitError] = useState('');
  const [retroTime, setRetroTime] = useState({ h: 0, m: 0, s: 0 });
  const [tempSettings, setTempSettings] = useState({});
  const [tempDrivers, setTempDrivers] = useState([]);
  const [tempSchedule, setTempSchedule] = useState([]);

  // --- Real Time Calculations ---
  const elapsedRaceTimeSecs = totalRaceDuration - raceTimeLeft;
  const startSecsOfDay = raceStartTime.h * 3600 + raceStartTime.m * 60;
  const currentSecsOfDay = (startSecsOfDay + elapsedRaceTimeSecs) % 86400;
  const fuelOutSecsOfDay = (currentSecsOfDay + fuelTimeLeft) % 86400;

  // --- CLOUD SYNC ARCHITECTURE ---
  const stateRef = useRef();
  stateRef.current = {
      totalRaceDuration, raceStartTime, minStintDuration, hasMandatoryStops,
      requiredPitStops, dryFuelMax, wetFuelMax, maintStops, drivers,
      isRunning, raceTimeLeft, fuelTimeLeft, activeStintTime, completedPitStops,
      currentDriver, driverSchedule, trackStatus, trackWeatherCondition,
      driverTotalTimes, raceLogs
  };

  const pushStateToCloud = async (overrides = {}) => {
      if (!user || !db) return;
      const payload = {
          ...stateRef.current,
          ...overrides,
          updatedBy: clientId,
          lastSyncRealTime: Date.now()
      };
      try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'race', 'state');
          await setDoc(docRef, payload);
          setSyncStatus('synced');
      } catch (e) {
          console.error("Failed to sync to cloud", e);
          setSyncStatus('error');
      }
  };

  // Auth Initialization (Safe for Netlify)
  useEffect(() => {
      if (!auth) return;
      const initAuth = async () => {
          try {
              if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                  await signInWithCustomToken(auth, __initial_auth_token);
              } else {
                  await signInAnonymously(auth);
              }
          } catch (error) {
              console.error("Firebase Authentication Failed", error);
              setSyncStatus('error');
          }
      };
      initAuth();
      const unsubscribe = onAuthStateChanged(auth, setUser);
      return () => unsubscribe();
  }, []);

  // Cloud Listener
  useEffect(() => {
      if (!user || !db) return;
      setSyncStatus('connecting');
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'race', 'state');
      const unsub = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
              const data = snap.data();
              if (data.updatedBy !== clientId) {
                  // Absorb external state changes seamlessly
                  setTotalRaceDuration(data.totalRaceDuration);
                  setRaceStartTime(data.raceStartTime);
                  setMinStintDuration(data.minStintDuration);
                  setHasMandatoryStops(data.hasMandatoryStops);
                  setRequiredPitStops(data.requiredPitStops);
                  setDryFuelMax(data.dryFuelMax);
                  setWetFuelMax(data.wetFuelMax);
                  setMaintStops(data.maintStops);
                  setDrivers(data.drivers);
                  
                  setIsRunning(data.isRunning);
                  setCompletedPitStops(data.completedPitStops);
                  setCurrentDriver(data.currentDriver);
                  setDriverSchedule(data.driverSchedule);
                  setTrackStatus(data.trackStatus);
                  setTrackWeatherCondition(data.trackWeatherCondition);
                  setRaceLogs(data.raceLogs);
                  
                  // Dynamically catch up local clocks based on real time passed since sender synced
                  const passedSecs = data.isRunning ? Math.floor((Date.now() - data.lastSyncRealTime) / 1000) : 0;
                  setRaceTimeLeft(Math.max(0, data.raceTimeLeft - passedSecs));
                  setFuelTimeLeft(Math.max(0, data.fuelTimeLeft - passedSecs));
                  setActiveStintTime(data.activeStintTime + passedSecs);

                  const updatedTimes = { ...data.driverTotalTimes };
                  if (data.isRunning) {
                      updatedTimes[data.currentDriver] = (updatedTimes[data.currentDriver] || 0) + passedSecs;
                  }
                  setDriverTotalTimes(updatedTimes);
                  setSyncStatus('synced');
              }
          } else {
              // First one here initiates the master cloud state
              pushStateToCloud();
          }
      }, (error) => {
          console.error("Sync listener error", error);
          setSyncStatus('error');
      });
      return () => unsub();
  }, [user]);

  // Periodic Keep-Alive Sync
  useEffect(() => {
      if (!isRunning) return;
      const interval = setInterval(() => {
          pushStateToCloud(); 
      }, 15000);
      return () => clearInterval(interval);
  }, [isRunning, user]);

  // Fetch Weather
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=51.4416&longitude=5.4697&current=temperature_2m,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&wind_speed_unit=kmh&timezone=auto`);
        const data = await res.json();
        setWeatherData(data.current);
        
        const forecastArray = data.hourly.time.map((t, i) => ({ 
            time: t, 
            temp: Math.round(data.hourly.temperature_2m[i]), 
            code: data.hourly.weather_code[i],
            rain: data.hourly.precipitation[i]
        })).slice(0, 24);
        
        setHourlyForecast(forecastArray);

        const upcomingRain = forecastArray.slice(0, 2).some(f => f.rain > 0);
        setRainWarningActive(upcomingRain);

      } catch(e) {}
    };
    fetchWeather();
    const inv = setInterval(fetchWeather, 300000); 
    return () => clearInterval(inv);
  }, []);

  // Race Clock TICKER (Local execution, synced via real-world time matching)
  useEffect(() => {
    let interval;
    if (isRunning && raceTimeLeft > 0) {
      interval = setInterval(() => {
        setRaceTimeLeft(prev => Math.max(0, prev - 1));
        setFuelTimeLeft(prev => Math.max(0, prev - 1));
        setActiveStintTime(prev => prev + 1);
        setDriverTotalTimes(prev => ({ ...prev, [currentDriver]: (prev[currentDriver] || 0) + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, raceTimeLeft, currentDriver]);

  // --- Actions ---
  const createLog = (message, type = 'info', customRaceTimeStr = null) => {
    return {
      id: Date.now(),
      time: customRaceTimeStr || formatTime(raceTimeLeft),
      realTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      message,
      type
    };
  };

  const startRace = () => {
    const newLog = createLog(raceTimeLeft === totalRaceDuration ? 'Race Started!' : 'Race clock active.', 'success');
    const newLogs = [newLog, ...raceLogs];
    
    setIsRunning(true);
    setRaceLogs(newLogs);
    pushStateToCloud({ isRunning: true, raceLogs: newLogs });
  };

  const handleResetRequest = () => {
      setShowResetConfirm(true);
  };

  const confirmResetRace = () => {
      const targetLen = hasMandatoryStops ? requiredPitStops : Math.max(5, Math.ceil(totalRaceDuration / dryFuelMax) + 2);
      const newSchedule = Array.from({ length: targetLen }, (_, i) => drivers[(i + 1) % drivers.length].name);
      const newDriverTimes = drivers.reduce((acc, d) => ({ ...acc, [d.name]: 0 }), {});
      
      const newState = {
          isRunning: false,
          raceTimeLeft: totalRaceDuration,
          fuelTimeLeft: trackWeatherCondition === 'DRY' ? dryFuelMax : wetFuelMax,
          activeStintTime: 0,
          completedPitStops: 0,
          driverTotalTimes: newDriverTimes,
          raceLogs: [],
          currentDriver: drivers[0].name,
          driverSchedule: newSchedule,
          trackStatus: 'GREEN'
      };
      
      setIsRunning(newState.isRunning);
      setRaceTimeLeft(newState.raceTimeLeft);
      setFuelTimeLeft(newState.fuelTimeLeft);
      setActiveStintTime(newState.activeStintTime);
      setCompletedPitStops(newState.completedPitStops);
      setDriverTotalTimes(newState.driverTotalTimes);
      setRaceLogs(newState.raceLogs);
      setCurrentDriver(newState.currentDriver);
      setDriverSchedule(newState.driverSchedule);
      setTrackStatus(newState.trackStatus);
      setShowResetConfirm(false);

      pushStateToCloud(newState);
  };

  const handlePitStop = () => {
    const oldDriver = currentDriver;
    let nextDriver = currentDriver;
    let newCompletedPits = completedPitStops;
    let newSched = [...driverSchedule];

    if (!hasMandatoryStops || completedPitStops < requiredPitStops) {
      newCompletedPits++;
      nextDriver = driverSchedule[0] || drivers[(drivers.findIndex(d => d.name === currentDriver) + 1) % drivers.length].name;
      
      newSched = newSched.slice(1);
      if (!hasMandatoryStops && newSched.length < 3) {
          const lastInQueue = newSched[newSched.length - 1] || nextDriver;
          const nextIdx = (drivers.findIndex(d => d.name === lastInQueue) + 1) % drivers.length;
          newSched.push(drivers[nextIdx].name);
      }
    }
    
    const newFuel = trackWeatherCondition === 'DRY' ? dryFuelMax : wetFuelMax;
    const newLog = createLog(`PIT STOP: ${oldDriver} OUT ➔ ${nextDriver} IN (Stint length: ${formatTime(activeStintTime)})`, 'info');
    const newLogs = [newLog, ...raceLogs];

    const newState = {
        completedPitStops: newCompletedPits,
        currentDriver: nextDriver,
        driverSchedule: newSched,
        fuelTimeLeft: newFuel,
        activeStintTime: 0,
        raceLogs: newLogs
    };

    setCompletedPitStops(newState.completedPitStops);
    setCurrentDriver(newState.currentDriver);
    setDriverSchedule(newState.driverSchedule);
    setFuelTimeLeft(newState.fuelTimeLeft);
    setActiveStintTime(newState.activeStintTime);
    setRaceLogs(newState.raceLogs);

    pushStateToCloud(newState);
  };

  // --- Retroactive Pit Stop Handlers ---
  const openRetroPitModal = () => {
      setRetroPitError('');
      setRetroTime({
          h: Math.floor(raceTimeLeft / 3600),
          m: Math.floor((raceTimeLeft % 3600) / 60),
          s: raceTimeLeft % 60
      });
      setShowRetroPitModal(true);
  };

  const handleRetroactivePitStop = () => {
      setRetroPitError('');
      const retroRaceTimeSec = (retroTime.h * 3600) + (retroTime.m * 60) + retroTime.s;

      if (retroRaceTimeSec > totalRaceDuration || retroRaceTimeSec < raceTimeLeft) {
          setRetroPitError("Invalid time: Must be between current clock and race start.");
          return;
      }

      const timeSincePit = retroRaceTimeSec - raceTimeLeft;

      if (timeSincePit > activeStintTime) {
          setRetroPitError("Invalid time: Cannot log a stop before current stint began.");
          return;
      }

      const oldDriver = currentDriver;
      let nextDriver = currentDriver;
      let newCompletedPits = completedPitStops;
      let newSched = [...driverSchedule];

      if (!hasMandatoryStops || completedPitStops < requiredPitStops) {
          newCompletedPits++;
          nextDriver = driverSchedule[0] || drivers[(drivers.findIndex(d => d.name === currentDriver) + 1) % drivers.length].name;
          newSched = newSched.slice(1);
          if (!hasMandatoryStops && newSched.length < 3) {
              const lastInQueue = newSched[newSched.length - 1] || nextDriver;
              const nextIdx = (drivers.findIndex(d => d.name === lastInQueue) + 1) % drivers.length;
              newSched.push(drivers[nextIdx].name);
          }
      }

      const newFuel = (trackWeatherCondition === 'DRY' ? dryFuelMax : wetFuelMax) - timeSincePit;
      const newActiveStint = timeSincePit;
      
      const newDriverTimes = {
          ...driverTotalTimes,
          [oldDriver]: Math.max(0, (driverTotalTimes[oldDriver] || 0) - timeSincePit),
          [nextDriver]: (driverTotalTimes[nextDriver] || 0) + timeSincePit
      };

      const newLog = createLog(`RETRO PIT STOP: ${oldDriver} OUT ➔ ${nextDriver} IN (Logged retroactively for Race Clock ${formatTime(retroRaceTimeSec)})`, 'warning', formatTime(retroRaceTimeSec));
      const newLogs = [newLog, ...raceLogs];

      const newState = {
          completedPitStops: newCompletedPits,
          currentDriver: nextDriver,
          driverSchedule: newSched,
          fuelTimeLeft: newFuel,
          activeStintTime: newActiveStint,
          driverTotalTimes: newDriverTimes,
          raceLogs: newLogs
      };

      setCompletedPitStops(newState.completedPitStops);
      setCurrentDriver(newState.currentDriver);
      setDriverSchedule(newState.driverSchedule);
      setFuelTimeLeft(newState.fuelTimeLeft);
      setActiveStintTime(newState.activeStintTime);
      setDriverTotalTimes(newState.driverTotalTimes);
      setRaceLogs(newState.raceLogs);
      setShowRetroPitModal(false);

      pushStateToCloud(newState);
  };

  const handleTrackStatusChange = (status) => {
      const newLog = createLog(`Track status changed to ${status}`, status === 'GREEN' ? 'success' : status === 'YELLOW' ? 'warning' : 'danger');
      const newLogs = [newLog, ...raceLogs];
      setTrackStatus(status);
      setRaceLogs(newLogs);
      pushStateToCloud({ trackStatus: status, raceLogs: newLogs });
  };

  const handleWeatherConditionChange = (condition) => {
      const oldMax = condition === 'DRY' ? wetFuelMax : dryFuelMax;
      const newMax = condition === 'DRY' ? dryFuelMax : wetFuelMax;
      const diff = newMax - oldMax;
      
      const newFuel = Math.max(0, fuelTimeLeft + diff);
      const newLog = createLog(`Weather set to ${condition}. Fuel limit adapted.`, 'info');
      const newLogs = [newLog, ...raceLogs];

      setTrackWeatherCondition(condition);
      setFuelTimeLeft(newFuel);
      setRaceLogs(newLogs);
      pushStateToCloud({ trackWeatherCondition: condition, fuelTimeLeft: newFuel, raceLogs: newLogs });
  };

  const openScheduleMenu = () => {
      setTempSchedule([...driverSchedule]);
      setShowScheduleMenu(true);
  };

  const autoFillSchedule = () => {
      const newSched = [];
      let currentIdx = drivers.findIndex(d => d.name === currentDriver);
      if (currentIdx === -1) currentIdx = 0;

      const stopsToFill = hasMandatoryStops 
          ? Math.max(0, requiredPitStops - completedPitStops) 
          : Math.max(5, Math.ceil(raceTimeLeft / (trackWeatherCondition === 'DRY' ? dryFuelMax : wetFuelMax)) + 2);

      for (let i = 0; i < stopsToFill; i++) {
          currentIdx = (currentIdx + 1) % drivers.length;
          newSched.push(drivers[currentIdx].name);
      }
      setTempSchedule(newSched);
  };

  const openSettings = () => {
    setTempSettings({
        raceH: Math.floor(totalRaceDuration / 3600), 
        raceM: Math.floor((totalRaceDuration % 3600) / 60), 
        startH: raceStartTime.h,
        startM: raceStartTime.m,
        minStintM: Math.floor(minStintDuration / 60), 
        hasMandatoryStops: hasMandatoryStops,
        stops: requiredPitStops,
        dryFuelM: Math.floor(dryFuelMax / 60),
        wetFuelM: Math.floor(wetFuelMax / 60),
        maint1H: maintStops[0].h, maint1M: maintStops[0].m, maint1Active: maintStops[0].active,
        maint2H: maintStops[1].h, maint2M: maintStops[1].m, maint2Active: maintStops[1].active
    });
    setTempDrivers([...drivers]);
    setShowSettings(true);
  };

  const saveSettings = () => {
    const newRaceDuration = (tempSettings.raceH * 3600) + (tempSettings.raceM * 60);
    const newDryFuelMax = tempSettings.dryFuelM * 60;
    const newWetFuelMax = tempSettings.wetFuelM * 60;
    
    let newRaceTimeLeft = raceTimeLeft;
    let newFuelTimeLeft = fuelTimeLeft;
    let newLogs = [...raceLogs];

    if (newRaceDuration !== totalRaceDuration) {
        const diff = newRaceDuration - totalRaceDuration;
        newRaceTimeLeft = Math.max(0, raceTimeLeft + diff);
        newLogs = [createLog(`Race duration adjusted by ${diff > 0 ? '+' : ''}${Math.round(diff/60)} mins.`, 'warning'), ...newLogs];
    }

    if (trackWeatherCondition === 'DRY' && newDryFuelMax !== dryFuelMax) {
        const diff = newDryFuelMax - dryFuelMax;
        newFuelTimeLeft = Math.max(0, fuelTimeLeft + diff);
    } else if (trackWeatherCondition === 'WET' && newWetFuelMax !== wetFuelMax) {
        const diff = newWetFuelMax - wetFuelMax;
        newFuelTimeLeft = Math.max(0, fuelTimeLeft + diff);
    }

    let newSched = [...driverSchedule];
    const remainingStops = tempSettings.hasMandatoryStops 
        ? Math.max(0, tempSettings.stops - completedPitStops)
        : Math.max(5, Math.ceil(newRaceTimeLeft / newDryFuelMax) + 2); 
    
    if (remainingStops > 0) {
        if (newSched.length > remainingStops && tempSettings.hasMandatoryStops) {
            newSched = newSched.slice(0, remainingStops);
        } else if (newSched.length < remainingStops) {
            let lastDriverIdx = tempDrivers.findIndex(d => d.name === (newSched[newSched.length - 1] || currentDriver));
            if (lastDriverIdx === -1) lastDriverIdx = 0;
            for (let i = newSched.length; i < remainingStops; i++) {
                lastDriverIdx = (lastDriverIdx + 1) % tempDrivers.length;
                newSched.push(tempDrivers[lastDriverIdx].name);
            }
        }
    } else if (tempSettings.hasMandatoryStops) {
        newSched = [];
    }

    let newCurrentDriver = currentDriver;
    if (!isRunning && completedPitStops === 0) {
        if (!tempDrivers.find(d => d.name === currentDriver)) {
            newCurrentDriver = tempDrivers[0].name;
        }
    }

    const newMaintStops = [
        { id: 1, h: tempSettings.maint1H, m: tempSettings.maint1M, active: tempSettings.maint1Active },
        { id: 2, h: tempSettings.maint2H, m: tempSettings.maint2M, active: tempSettings.maint2Active }
    ];

    const newState = {
        totalRaceDuration: newRaceDuration,
        raceTimeLeft: newRaceTimeLeft,
        raceStartTime: { h: tempSettings.startH, m: tempSettings.startM },
        minStintDuration: tempSettings.minStintM * 60,
        hasMandatoryStops: tempSettings.hasMandatoryStops,
        requiredPitStops: tempSettings.stops,
        dryFuelMax: newDryFuelMax,
        wetFuelMax: newWetFuelMax,
        maintStops: newMaintStops,
        drivers: tempDrivers,
        fuelTimeLeft: newFuelTimeLeft,
        driverSchedule: newSched,
        currentDriver: newCurrentDriver,
        raceLogs: newLogs
    };

    setTotalRaceDuration(newState.totalRaceDuration);
    setRaceTimeLeft(newState.raceTimeLeft);
    setRaceStartTime(newState.raceStartTime);
    setMinStintDuration(newState.minStintDuration);
    setHasMandatoryStops(newState.hasMandatoryStops);
    setRequiredPitStops(newState.requiredPitStops);
    setDryFuelMax(newState.dryFuelMax);
    setWetFuelMax(newState.wetFuelMax);
    setMaintStops(newState.maintStops);
    setDrivers(newState.drivers);
    setFuelTimeLeft(newState.fuelTimeLeft);
    setDriverSchedule(newState.driverSchedule);
    setCurrentDriver(newState.currentDriver);
    setRaceLogs(newState.raceLogs);
    
    setShowSettings(false);
    pushStateToCloud(newState);
  };

  const getDriverWeight = (name) => {
      const driver = drivers.find(d => d.name === name);
      return driver ? driver.weight : 0;
  };

  const advice = useMemo(() => {
    if (!isRunning && raceTimeLeft === totalRaceDuration) return { text: "Awaiting Start", color: "text-slate-400", bg: "bg-slate-800/50", borderColor: "border-slate-700" };
    if (trackStatus === 'RED') return { text: "Session Halted", color: "text-red-500", bg: "bg-red-500/20", borderColor: "border-red-500" };
    if (fuelTimeLeft <= 300) return { text: "FUEL & STINT CRITICAL", color: "text-red-500", bg: "bg-red-500/20", borderColor: "border-red-500 animate-pulse" };
    return { text: "Maintain Pace", color: "text-emerald-400", bg: "bg-emerald-400/10", borderColor: "border-emerald-400/30" };
  }, [isRunning, trackStatus, fuelTimeLeft, raceTimeLeft, totalRaceDuration]);

  const canPit = (totalRaceDuration - raceTimeLeft) >= minStintDuration && (!hasMandatoryStops || completedPitStops < requiredPitStops) && trackStatus !== 'RED';
  const isPitWindowOpen = (totalRaceDuration - raceTimeLeft) >= minStintDuration;

  // --- Maintenance Forecast Engine ---
  const generateMaintForecasts = () => {
      const forecasts = [];
      const currentMaxFuel = trackWeatherCondition === 'DRY' ? dryFuelMax : wetFuelMax;

      maintStops.filter(m => m.active).forEach(maint => {
          const targetSecsOfDay = maint.h * 3600 + maint.m * 60;
          let targetElapsed = targetSecsOfDay - startSecsOfDay;
          if (targetElapsed < 0) targetElapsed += 86400;

          if (elapsedRaceTimeSecs >= targetElapsed || targetElapsed > totalRaceDuration) return;

          const timeToTarget = targetElapsed - elapsedRaceTimeSecs;
          let stopsNeeded = 0;
          let fuelRemainingAtTarget = 0;

          if (timeToTarget <= fuelTimeLeft) {
              fuelRemainingAtTarget = fuelTimeLeft - timeToTarget;
          } else {
              const timeAfterCurrentTank = timeToTarget - fuelTimeLeft;
              stopsNeeded = Math.ceil(timeAfterCurrentTank / currentMaxFuel);
              const totalFuelCapacityAdded = stopsNeeded * currentMaxFuel;
              fuelRemainingAtTarget = totalFuelCapacityAdded - timeAfterCurrentTank;
          }

          let status = 'POOR';
          let badgeColor = 'bg-red-500/20 text-red-400 border-red-500';
          let textColor = 'text-red-400';
          let adviceText = 'High misalignment. Adjust stint lengths dramatically.';

          if (fuelRemainingAtTarget <= 15 * 60) {
              status = 'PERFECT WINDOW';
              badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500';
              textColor = 'text-emerald-400';
              adviceText = 'Aligned. Maintain current fuel strategy.';
          } else if (fuelRemainingAtTarget <= 30 * 60) {
              status = 'SLIGHTLY EARLY';
              badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500';
              textColor = 'text-amber-400';
              adviceText = 'You will have too much fuel. Try to stretch a stint to skip a stop.';
          } else {
              adviceText = `You will pit ${Math.round(fuelRemainingAtTarget/60)}m early. Burn fuel or save aggressively to shift window.`;
          }

          forecasts.push({
              id: maint.id,
              timeLabel: `${formatHHMM(targetSecsOfDay)} Stop`,
              timeToTargetStr: formatTime(timeToTarget),
              stopsNeeded,
              fuelRemainingMins: Math.round(fuelRemainingAtTarget / 60),
              status,
              badgeColor,
              textColor,
              adviceText
          });
      });
      return forecasts;
  };

  const activeForecasts = generateMaintForecasts();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center sticky top-0 z-40 shadow-xl">
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <div className="bg-white rounded-lg p-1.5 shadow-inner hidden sm:block">
             <img src="https://i.ibb.co/LdqF6g6/logo-Red-Burros-back-white.png" alt="Red Burros" className="h-8 sm:h-12 w-auto object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg sm:text-xl font-black text-white uppercase leading-none tracking-tight">{teamName}</h1>
            <span className="text-[9px] font-bold text-slate-500 tracking-[0.25em] uppercase mt-1">Manual Pit Wall</span>
          </div>
        </div>

        {rainWarningActive && (
            <div className="hidden lg:flex bg-yellow-500/20 border border-yellow-500 text-yellow-400 px-5 py-2 rounded-xl items-center gap-3 animate-pulse shadow-[0_0_20px_rgba(234,179,8,0.2)] mx-4">
                <AlertTriangle className="w-7 h-7 flex-shrink-0" />
                <div className="flex flex-col">
                    <span className="font-black uppercase text-[10px] tracking-widest leading-tight">CRITICAL WEATHER ALERT</span>
                    <span className="text-sm font-bold leading-tight text-white">Rain forecasted within the next hour!</span>
                </div>
            </div>
        )}

        <div className="flex gap-4 sm:gap-6 items-center shrink-0">
          {rainWarningActive && (
              <div className="lg:hidden bg-yellow-500/20 border border-yellow-500 text-yellow-400 p-2 rounded-lg animate-pulse flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Rain Alert</span>
              </div>
          )}

          {/* Cloud Sync Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 shadow-inner">
             {syncStatus === 'synced' && <Cloud className="w-3.5 h-3.5 text-emerald-500" />}
             {syncStatus === 'connecting' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
             {syncStatus === 'error' && <CloudOff className="w-3.5 h-3.5 text-red-500" />}
             {syncStatus === 'offline' && <CloudOff className="w-3.5 h-3.5 text-slate-600" />}
             <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 hidden sm:block">
                 {syncStatus === 'synced' ? 'Live Sync' : syncStatus === 'connecting' ? 'Connecting' : syncStatus === 'error' ? 'Sync Error' : 'Offline'}
             </span>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Race Clock</span>
            <span className={`text-xl sm:text-2xl font-mono font-black leading-none ${isRunning ? 'text-white' : 'text-slate-500'}`}>{formatTime(raceTimeLeft)}</span>
          </div>
          <button onClick={openSettings} className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-slate-400 transition-colors">
              <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Driver & Strategy */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
            <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-4">Active Driver</h2>
            <div className="flex justify-between items-center mb-6">
                <div className="text-4xl font-black text-white tracking-tight truncate">{currentDriver}</div>
            </div>
            
            <div className="flex items-center gap-2 mb-6 bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-inner">
                <Scale className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Added Ballast:</span>
                <span className="text-sm font-black text-emerald-400">{getDriverWeight(currentDriver)} KG</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-black text-blue-500 tracking-widest">UP NEXT</span>
                    <button onClick={openScheduleMenu} className="text-[9px] font-black text-slate-400 hover:text-blue-400 uppercase tracking-widest flex items-center gap-1 transition-colors">
                        <ListOrdered className="w-3 h-3" /> Edit Plan
                    </button>
                </div>
                <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-slate-200">{driverSchedule[0] || '---'}</span>
                    {driverSchedule[0] && (
                        <span className="text-xs font-mono font-bold text-slate-500">+{getDriverWeight(driverSchedule[0])}kg</span>
                    )}
                </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Pit Strategy</h2>
               {hasMandatoryStops ? (
                   <span className="text-xs font-mono font-bold text-blue-400">{requiredPitStops - completedPitStops} / {requiredPitStops} Left</span>
               ) : (
                   <span className="text-xs font-mono font-bold text-blue-400">{completedPitStops} Stops Made</span>
               )}
            </div>
            
            {hasMandatoryStops && (
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {Array.from({ length: requiredPitStops }).map((_, i) => (
                    <div key={i} className={`h-2.5 rounded-full transition-colors ${i < completedPitStops ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-800'}`} />
                  ))}
                </div>
            )}

            <button 
              disabled={!canPit} 
              onClick={handlePitStop} 
              className={`w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg active:scale-95 ${canPit ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'}`}
            >
              Log Pit Stop & Driver Swap
            </button>
            
            {/* Retroactive Pit Stop Button */}
            <div className="mt-3 flex justify-center">
                <button 
                  onClick={openRetroPitModal} 
                  disabled={!isRunning && raceTimeLeft === totalRaceDuration}
                  className="text-[10px] text-slate-500 hover:text-amber-500 uppercase tracking-widest font-bold flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <History className="w-3 h-3" /> Log Past Pit Stop
                </button>
            </div>

            {!isPitWindowOpen && (
               <p className="text-[9px] text-slate-500 text-center mt-3 uppercase font-bold tracking-widest">Window opens in {formatTime(minStintDuration - (totalRaceDuration - raceTimeLeft))}</p>
            )}
          </section>

          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
             <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-4">Driver Track Time</h2>
             <div className="space-y-2">
                {drivers.map(d => (
                    <div key={d.name} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className={`text-xs font-bold ${d.name === currentDriver ? 'text-blue-400' : 'text-slate-400'}`}>{d.name}</span>
                        <span className="text-xs font-mono font-bold text-slate-300">{formatTime(driverTotalTimes[d.name] || 0)}</span>
                    </div>
                ))}
             </div>
          </section>
        </div>

        {/* Center: Manual Event Log */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl h-full flex flex-col min-h-[500px]">
             <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-500" /> Manual Race Log</h2>
             </div>

             <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
               {raceLogs.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-600 py-12">
                     <ClipboardList className="w-12 h-12 mb-4 opacity-20" />
                     <div className="text-[10px] uppercase font-black italic tracking-widest">No events logged yet.</div>
                     <div className="text-[9px] uppercase font-bold mt-2">Start the race to begin tracking.</div>
                 </div>
               ) : (
                 raceLogs.map(log => (
                   <div key={log.id} className={`p-3 rounded-xl border flex flex-col gap-1 shadow-sm ${
                       log.type === 'success' ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' :
                       log.type === 'warning' ? 'bg-amber-950/30 border-amber-900/50 text-amber-400' :
                       log.type === 'danger' ? 'bg-red-950/30 border-red-900/50 text-red-400' :
                       'bg-slate-800/30 border-slate-700 text-slate-300'
                   }`}>
                     <div className="flex justify-between items-center opacity-70">
                         <span className="text-[9px] font-black uppercase tracking-widest">Race: {log.time}</span>
                         <span className="text-[9px] font-bold">{log.realTime}</span>
                     </div>
                     <div className="text-xs font-bold leading-relaxed">{log.message}</div>
                   </div>
                 ))
               )}
             </div>
          </section>
        </div>

        {/* Right Column: Timers & Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          <section className="bg-slate-900 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-xl flex flex-col relative overflow-hidden">
             <div className={`w-full rounded-2xl p-4 border flex flex-col items-center justify-center mb-6 ${advice.bg} ${advice.borderColor}`}>
                <span className={`text-xl font-black uppercase tracking-tight text-center ${advice.color}`}>{advice.text}</span>
             </div>
             
             <div className="flex flex-col gap-4">
                {/* Fuel Timer */}
                <div className={`flex flex-col items-center justify-center bg-slate-950 py-4 px-6 rounded-2xl border ${fuelTimeLeft <= 300 ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-slate-800 shadow-inner'}`}>
                   <h2 className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-black mb-1 flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5" /> Fuel Window</h2>
                   <div className={`text-4xl sm:text-5xl font-mono font-black tracking-tighter ${fuelTimeLeft <= 300 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
                     {formatTime(fuelTimeLeft)}
                   </div>
                   <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Empty At: <span className="text-white">{formatHHMM(fuelOutSecsOfDay)}</span></span>
                </div>

                {/* Stint Timer (Count Up) */}
                <div className={`flex flex-col items-center justify-center bg-slate-950 py-4 px-6 rounded-2xl border ${fuelTimeLeft <= 300 ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-slate-800 shadow-inner'}`}>
                   <h2 className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-black mb-1 flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Active Stint Time</h2>
                   <div className={`text-4xl sm:text-5xl font-mono font-black tracking-tighter ${fuelTimeLeft <= 300 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                     {formatTime(activeStintTime)}
                   </div>
                   <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Limit: <span className="text-white">Matches Fuel Window</span></span>
                </div>
             </div>
          </section>

          {/* Maintenance Alignment Forecast Card */}
          {activeForecasts.length > 0 && (
              <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
                 <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-4 flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-500" /> Maintenance & Fuel Alignment</h2>
                 <div className="space-y-3">
                     {activeForecasts.map(forecast => (
                         <div key={forecast.id} className="bg-slate-950 rounded-xl p-4 border border-slate-800 shadow-inner flex flex-col gap-3">
                             <div className="flex justify-between items-center">
                                 <span className="text-sm font-black text-white">{forecast.timeLabel} <span className="text-[10px] text-slate-500 uppercase ml-2 tracking-widest">(in {forecast.timeToTargetStr})</span></span>
                                 <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${forecast.badgeColor}`}>{forecast.status}</span>
                             </div>
                             <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                 <div className="flex flex-col">
                                     <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Fuel At Target</span>
                                     <span className={`text-lg font-mono font-black ${forecast.textColor}`}>{forecast.fuelRemainingMins} mins</span>
                                 </div>
                                 <div className="flex flex-col">
                                     <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Intervening Stops</span>
                                     <span className="text-lg font-mono font-black text-slate-300">{forecast.stopsNeeded}</span>
                                 </div>
                             </div>
                             <div className="text-[10px] font-bold text-slate-400 italic">
                                 {forecast.adviceText}
                             </div>
                         </div>
                     ))}
                 </div>
              </section>
          )}

          {/* Master Controls */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col gap-5 shadow-xl">
             <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Master Controls</h2>
             
             {/* Weather / Fuel Condition Toggle */}
             <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800 shadow-inner">
                <button onClick={() => handleWeatherConditionChange('DRY')} className={`flex-1 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all ${trackWeatherCondition === 'DRY' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>
                    Dry Setup
                </button>
                <button onClick={() => handleWeatherConditionChange('WET')} className={`flex-1 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all ${trackWeatherCondition === 'WET' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>
                    Wet Setup
                </button>
             </div>

             <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800 shadow-inner">
                {['GREEN', 'YELLOW', 'RED'].map(s => (
                  <button key={s} onClick={() => handleTrackStatusChange(s)} className={`flex-1 py-3 rounded-lg font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-1 ${trackStatus === s ? (s==='GREEN'?'bg-emerald-600':s==='YELLOW'?'bg-yellow-500':'bg-red-600') + ' text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>
                      <Flag className="w-3 h-3" /> {s}
                  </button>
                ))}
             </div>

             <div className="flex gap-4">
                {!isRunning ? (
                    <button onClick={startRace} className="flex-1 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg text-white shadow-blue-900/20">
                        <Play className="fill-current w-5 h-5" /> Start Race
                    </button>
                ) : (
                    <div className="flex-1 py-5 bg-slate-950 border border-emerald-500/30 text-emerald-500 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-inner">
                        <Activity className="w-5 h-5 animate-pulse" /> Track Active
                    </div>
                )}
                <button 
                    onClick={handleResetRequest} 
                    className="px-8 py-5 bg-slate-800 hover:bg-red-900/40 hover:text-red-400 text-slate-400 rounded-2xl font-black uppercase text-xs transition-all active:scale-95 flex items-center gap-2"
                >
                    <Square className="w-4 h-4" /> Reset
                </button>
             </div>
          </section>

          {/* Weather & Rain Warnings */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col">
             <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-4 flex items-center gap-2"><MapPin className="w-3 h-3 text-red-500" /> {locationName} Forecast</h2>
             
             <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {hourlyForecast.map((f, i) => (
                  <div key={i} className={`min-w-[80px] bg-slate-950 p-4 rounded-2xl border flex flex-col items-center shadow-inner ${f.rain > 0 ? 'border-blue-500/50' : 'border-slate-800'}`}>
                     <span className="text-[10px] font-black text-slate-600 mb-2">{new Date(f.time).getHours()}:00</span>
                     <WeatherIcon code={f.code} />
                     <span className="text-sm font-black text-white mt-2">{f.temp}°</span>
                     {f.rain > 0 && <span className="text-[9px] font-bold text-blue-400 mt-1">{f.rain}mm</span>}
                  </div>
                ))}
             </div>
          </section>

        </div>
      </main>

      {/* Retroactive Pit Stop Modal */}
      {showRetroPitModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
           <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-8 sm:p-10 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6">
                 <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic flex items-center gap-3"><History className="w-6 h-6 text-amber-500" /> Log Missed Stop</h3>
                 <button onClick={() => setShowRetroPitModal(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg"><X className="w-5 h-5" /></button>
              </div>

              <div className="mb-6 bg-amber-950/30 border border-amber-900/50 p-4 rounded-xl">
                 <p className="text-xs text-amber-400 font-bold leading-relaxed text-center">
                    What was the Race Clock displaying when the driver actually pitted?
                 </p>
              </div>
              
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex justify-center gap-4 mb-8">
                  <div className="flex flex-col items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hrs</label>
                      <input type="number" value={retroTime.h} onChange={(e) => setRetroTime({...retroTime, h: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-white outline-none focus:border-amber-500 font-mono text-xl" />
                  </div>
                  <div className="text-2xl font-black text-slate-600 mt-8">:</div>
                  <div className="flex flex-col items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Min</label>
                      <input type="number" value={retroTime.m} onChange={(e) => setRetroTime({...retroTime, m: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-white outline-none focus:border-amber-500 font-mono text-xl" />
                  </div>
                  <div className="text-2xl font-black text-slate-600 mt-8">:</div>
                  <div className="flex flex-col items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Sec</label>
                      <input type="number" value={retroTime.s} onChange={(e) => setRetroTime({...retroTime, s: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-white outline-none focus:border-amber-500 font-mono text-xl" />
                  </div>
              </div>

              {retroPitError && (
                  <div className="mb-6 bg-red-500/20 border border-red-500 rounded-xl p-3 flex items-start gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span className="text-xs font-bold leading-tight">{retroPitError}</span>
                  </div>
              )}

              <button 
                onClick={handleRetroactivePitStop} 
                className="w-full py-5 bg-amber-600 hover:bg-amber-500 rounded-xl font-black uppercase tracking-widest text-white shadow-xl shadow-amber-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" /> Retroactively Update Times
              </button>
           </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
           <div className="bg-slate-900 border border-red-500/50 rounded-[2.5rem] p-8 sm:p-10 w-full max-w-md shadow-2xl">
              <div className="flex flex-col items-center text-center mb-8">
                 <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                     <AlertTriangle className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Confirm Reset</h3>
                 <p className="text-sm text-slate-400 mt-2 font-bold">
                    Are you sure you want to completely reset the race timers and logs? <span className="text-red-400">This cannot be undone.</span>
                 </p>
              </div>
              <div className="flex gap-4">
                  <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-black uppercase tracking-widest text-white transition-all"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={confirmResetRace}
                      className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black uppercase tracking-widest text-white shadow-xl shadow-red-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                      <Square className="w-4 h-4 fill-current" /> Reset Race
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Driver Schedule Planner Modal */}
      {showScheduleMenu && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-8 sm:p-10 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2 italic"><ListOrdered className="w-6 h-6 text-blue-500" /> Stint Planner</h3>
                    <button onClick={() => setShowScheduleMenu(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg"><X className="w-5 h-5" /></button>
                </div>

                <div className="mb-4 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 font-bold text-center">
                    {hasMandatoryStops 
                        ? "Planning mandatory remaining stops." 
                        : "No mandatory stops. Planning estimated remaining stops based on fuel capacity."}
                </div>

                <button onClick={autoFillSchedule} className="w-full mb-4 py-3 bg-slate-950 border border-slate-800 hover:border-blue-500 text-blue-400 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex justify-center items-center gap-2">
                    <Wand2 className="w-4 h-4" /> Auto-Fill Round Robin
                </button>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-6">
                    {tempSchedule.length === 0 ? (
                        <div className="text-center text-slate-500 text-xs py-4 font-bold uppercase tracking-widest">No pit stops required</div>
                    ) : (
                        tempSchedule.map((drvName, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-16">Stop {completedPitStops + idx + 1}</span>
                                <select 
                                    value={drvName}
                                    onChange={(e) => {
                                        const newSched = [...tempSchedule];
                                        newSched[idx] = e.target.value;
                                        setTempSchedule(newSched);
                                    }}
                                    className="flex-1 bg-slate-900 border border-slate-700 text-white font-bold rounded-lg p-2 outline-none focus:border-blue-500"
                                >
                                    {drivers.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                        ))
                    )}
                </div>

                {!hasMandatoryStops && (
                    <button 
                        onClick={() => setTempSchedule([...tempSchedule, drivers[0].name])}
                        className="w-full mb-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 border-dashed rounded-lg font-bold text-xs text-slate-400 uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add Stop to Plan
                    </button>
                )}

                <button 
                    onClick={() => { 
                        setDriverSchedule(tempSchedule); 
                        setShowScheduleMenu(false); 
                        pushStateToCloud({ driverSchedule: tempSchedule });
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                >
                    Save Strategy
                </button>
            </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
           <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-8 sm:p-10 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
                 <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">Race Parameters</h3>
                 <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Left Column: Timing */}
                 <div className="space-y-6">
                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner">
                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-4">Real World Start Time</label>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Hrs (0-23)</label>
                                <input type="number" value={tempSettings.startH} onChange={(e) => setTempSettings({...tempSettings, startH: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-emerald-500 font-mono text-lg" />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Min</label>
                                <input type="number" value={tempSettings.startM} onChange={(e) => setTempSettings({...tempSettings, startM: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-emerald-500 font-mono text-lg" />
                            </div>
                        </div>

                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-4 border-t border-slate-800 pt-4">Total Race Clock</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Hrs</label>
                                <input type="number" value={tempSettings.raceH} onChange={(e) => setTempSettings({...tempSettings, raceH: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono text-lg" />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Min</label>
                                <input type="number" value={tempSettings.raceM} onChange={(e) => setTempSettings({...tempSettings, raceM: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono text-lg" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner">
                        <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest block mb-4">Mandatory Maintenance Windows</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                                <label className="flex items-center gap-2 text-[9px] font-bold text-slate-300 uppercase cursor-pointer mb-2">
                                    <input type="checkbox" checked={tempSettings.maint1Active} onChange={(e) => setTempSettings({...tempSettings, maint1Active: e.target.checked})} className="w-3 h-3" /> 
                                    Window 1
                                </label>
                                <div className="flex items-center gap-1">
                                    <input type="number" value={tempSettings.maint1H} onChange={(e) => setTempSettings({...tempSettings, maint1H: Number(e.target.value)})} className="w-12 bg-slate-800 rounded p-1 text-center text-white font-mono text-xs outline-none focus:border-purple-500" />
                                    <span className="text-xs text-slate-500">:</span>
                                    <input type="number" value={tempSettings.maint1M} onChange={(e) => setTempSettings({...tempSettings, maint1M: Number(e.target.value)})} className="w-12 bg-slate-800 rounded p-1 text-center text-white font-mono text-xs outline-none focus:border-purple-500" />
                                </div>
                            </div>
                            <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                                <label className="flex items-center gap-2 text-[9px] font-bold text-slate-300 uppercase cursor-pointer mb-2">
                                    <input type="checkbox" checked={tempSettings.maint2Active} onChange={(e) => setTempSettings({...tempSettings, maint2Active: e.target.checked})} className="w-3 h-3" /> 
                                    Window 2
                                </label>
                                <div className="flex items-center gap-1">
                                    <input type="number" value={tempSettings.maint2H} onChange={(e) => setTempSettings({...tempSettings, maint2H: Number(e.target.value)})} className="w-12 bg-slate-800 rounded p-1 text-center text-white font-mono text-xs outline-none focus:border-purple-500" />
                                    <span className="text-xs text-slate-500">:</span>
                                    <input type="number" value={tempSettings.maint2M} onChange={(e) => setTempSettings({...tempSettings, maint2M: Number(e.target.value)})} className="w-12 bg-slate-800 rounded p-1 text-center text-white font-mono text-xs outline-none focus:border-purple-500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner">
                        <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-4">Fuel Parameters</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Dry Tank (Min)</label>
                                <input type="number" value={tempSettings.dryFuelM} onChange={(e) => setTempSettings({...tempSettings, dryFuelM: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-amber-400 outline-none focus:border-amber-500 font-mono" />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Wet Tank (Min)</label>
                                <input type="number" value={tempSettings.wetFuelM} onChange={(e) => setTempSettings({...tempSettings, wetFuelM: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-blue-400 outline-none focus:border-blue-500 font-mono" />
                            </div>
                        </div>
                    </div>
                 </div>

                 {/* Right Column: Drivers & Pit Stops */}
                 <div className="space-y-6">
                     <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-4">Pit Stop Strategy Rules</label>
                        <label className="flex items-center gap-3 text-xs font-bold text-slate-300 uppercase cursor-pointer mb-4">
                            <input type="checkbox" checked={tempSettings.hasMandatoryStops} onChange={(e) => setTempSettings({...tempSettings, hasMandatoryStops: e.target.checked})} className="w-4 h-4 rounded text-blue-500" /> 
                            Enable Mandatory Number of Stops
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {tempSettings.hasMandatoryStops && (
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase">Total Required Stops</label>
                                    <input type="number" value={tempSettings.stops} onChange={(e) => setTempSettings({...tempSettings, stops: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono" />
                                </div>
                            )}
                            <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase" title="Minimum minutes driver must be on track before window opens">Min Stint (Min)</label>
                                <input type="number" value={tempSettings.minStintM} onChange={(e) => setTempSettings({...tempSettings, minStintM: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500 font-mono" />
                            </div>
                        </div>
                    </div>

                     <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[360px]">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4">Driver Lineup & Weight Setup</label>
                        
                        <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                            {tempDrivers.map((driver, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        value={driver.name} 
                                        placeholder="Driver Name"
                                        onChange={(e) => {
                                            const newDrivers = [...tempDrivers];
                                            newDrivers[index].name = e.target.value;
                                            setTempDrivers(newDrivers);
                                        }}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-white font-bold outline-none focus:border-blue-500"
                                    />
                                    <div className="relative w-40 shrink-0">
                                        <input 
                                            type="number" 
                                            value={driver.weight} 
                                            onChange={(e) => {
                                                const newDrivers = [...tempDrivers];
                                                newDrivers[index].weight = Number(e.target.value);
                                                setTempDrivers(newDrivers);
                                            }}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-emerald-400 font-mono text-base font-bold outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 uppercase">KG</span>
                                    </div>
                                    <button 
                                        onClick={() => setTempDrivers(tempDrivers.filter((_, i) => i !== index))}
                                        className="p-2.5 bg-red-900/30 text-red-500 hover:bg-red-600 hover:text-white rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        
                        <button 
                            onClick={() => setTempDrivers([...tempDrivers, { name: 'New Driver', weight: 0 }])}
                            className="w-full mt-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 border-dashed rounded-lg font-bold text-xs text-slate-400 uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Driver
                        </button>
                     </div>
                 </div>
              </div>
              
              <button 
                onClick={saveSettings} 
                className="w-full py-5 bg-blue-600 hover:bg-blue-500 rounded-xl font-black uppercase tracking-widest text-white mt-8 shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
              >
                Save Race Parameters
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
