'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  dequeue,
  enqueue,
  listQueue,
  queueSize,
  queueSupported,
  type QueuedMeasurement,
} from '@/lib/kiosk/offline-queue';
import {
  logoutKiosk,
  skipCheck,
  submitMeasurement,
  verifyPin,
  type SubmitResult,
} from './actions';

export type KioskEmployee = { id: string; display_name: string };
export type KioskDevice = {
  id: string;
  name: string;
  type_name: string;
  minC: number | null;
  maxC: number | null;
  lastValue: number | null;
  prevValue: number | null;
  lastStatus: 'ok' | 'alarm' | null;
  lastAt: string | null;
  measuredToday: boolean;
  dueToday: boolean;
};

type Step = 'employee' | 'pin' | 'device' | 'value' | 'note' | 'skip' | 'result';

// Po uložení sa ide rovno na ďalšie zariadenie — PIN sa znovu NEPÝTA.
// Session zamestnanca sa zamkne až po nečinnosti.
const RESULT_AUTO_CONTINUE_MS = 2500;
const IDLE_LOCK_MS = 5 * 60 * 1000;

function fmt(v: number | null) {
  return v == null ? '—' : `${v.toLocaleString('sk-SK')} °C`;
}

function timeAgo(iso: string | null) {
  if (!iso) return 'zatiaľ nemerané';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'pred chvíľou';
  if (min < 60) return `pred ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `pred ${h} h`;
  return `pred ${Math.round(h / 24)} d`;
}

/** Šípka oproti predošlej hodnote — operátor tak zbadá plazivé otepľovanie. */
function trendArrow(last: number | null, prev: number | null): string | null {
  if (last == null || prev == null) return null;
  const diff = last - prev;
  if (Math.abs(diff) < 0.5) return '→';
  return diff > 0 ? '↑' : '↓';
}

const KEY_LABELS: Record<string, string> = {
  back: 'Vymazať poslednú číslicu',
  '±': 'Prepnúť znamienko',
  ',': 'Desatinná čiarka',
};

function Keypad({ onKey, keys }: { onKey: (k: string) => void; keys: string[] }) {
  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-3">
      {keys.map((k, i) => (
        <button
          key={`${k}-${i}`}
          type="button"
          onClick={() => k !== '' && onKey(k)}
          aria-hidden={k === ''}
          tabIndex={k === '' ? -1 : undefined}
          aria-label={KEY_LABELS[k] ?? k}
          className={`rounded-2xl py-5 text-2xl font-bold transition-colors duration-150 ${
            k === '' ? 'invisible' : 'bg-steel text-white active:bg-white/25'
          }`}
        >
          {k === 'back' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}

export default function KioskFlow({
  kioskName,
  employees,
  devices,
}: {
  kioskName: string;
  employees: KioskEmployee[];
  devices: KioskDevice[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState<KioskEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [device, setDevice] = useState<KioskDevice | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [pending, startTransition] = useTransition();
  const lastActivity = useRef(Date.now());
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PIN drží len pamäť — do IndexedDB sa zámerne neukladá.
  const pinRef = useRef('');

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const refreshPending = useCallback(async () => {
    if (!queueSupported()) return;
    try {
      setPendingCount(await queueSize());
    } catch {
      // Fronta je len poistka; jej zlyhanie nesmie zhodiť meranie.
    }
  }, []);

  const lockSession = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    pinRef.current = '';
    setStep('employee');
    setEmployee(null);
    setPin('');
    setDevice(null);
    setValue('');
    setNote('');
    setSkipReason('');
    setError(null);
    setResult(null);
    setDoneCount(0);
  }, []);

  /**
   * Odošle merania nazbierané počas výpadku. Vyžaduje PIN v pamäti —
   * po obnovení stránky ho treba zadať znova (fronta ho neukladá).
   */
  const flushQueue = useCallback(async () => {
    if (!queueSupported() || flushing || !pinRef.current) return;
    let items: QueuedMeasurement[] = [];
    try {
      items = await listQueue();
    } catch {
      return;
    }
    if (items.length === 0) return;

    setFlushing(true);
    try {
      for (const item of items) {
        try {
          const res = await submitMeasurement({
            membershipId: item.membershipId,
            pin: pinRef.current,
            deviceId: item.deviceId,
            valueC: item.valueC,
            note: item.note ?? undefined,
            clientUuid: item.id,
            clientMeasuredAt: item.capturedAt,
          });
          // Duplikát znamená, že server záznam už má — tiež ho z fronty
          // odstraňujeme, inak by tam viazol navždy.
          if (res.ok) {
            await dequeue(item.id);
          } else {
            break; // zlá autorizácia alebo zamknutie — nemá zmysel pokračovať
          }
        } catch {
          break; // stále offline
        }
      }
    } finally {
      setFlushing(false);
      await refreshPending();
    }
  }, [flushing, refreshPending]);

  useEffect(() => {
    void refreshPending();
    function onOnline() {
      void flushQueue();
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushQueue, refreshPending]);

  // Auto-zamknutie po nečinnosti — nikdy neprerušuje rozrobené meranie
  // skôr než po IDLE_LOCK_MS.
  useEffect(() => {
    const iv = setInterval(() => {
      if (employee && Date.now() - lastActivity.current > IDLE_LOCK_MS) {
        lockSession();
      }
    }, 10_000);
    return () => clearInterval(iv);
  }, [employee, lockSession]);

  // Výsledok: krátke potvrdenie a automaticky ďalšie zariadenie.
  useEffect(() => {
    if (step === 'result') {
      resetTimer.current = setTimeout(continueMeasuring, RESULT_AUTO_CONTINUE_MS);
      return () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Fyzická klávesnica: niektoré tablety majú dok, a bez nej sa flow nedá
  // ovládať jednou rukou pri manipulácii s teplomerom.
  useEffect(() => {
    if (step !== 'pin' && step !== 'value') return;

    function onKeyDown(e: KeyboardEvent) {
      const handler = step === 'pin' ? pinKey : valueKey;

      if (/^[0-9]$/.test(e.key)) {
        handler(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handler('back');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 'pin') checkPin();
        else submit();
      } else if (e.key === 'Escape') {
        lockSession();
      } else if (step === 'value' && (e.key === ',' || e.key === '.')) {
        e.preventDefault();
        valueKey(',');
      } else if (step === 'value' && e.key === '-') {
        e.preventDefault();
        valueKey('±');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, value, employee, device]);

  function continueMeasuring() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    touch();
    setDevice(null);
    setValue('');
    setNote('');
    setSkipReason('');
    setResult(null);
    setSavedOffline(false);
    setError(null);
    setStep('device');
  }

  function checkPin() {
    if (!employee) return;
    setError(null);
    touch();
    startTransition(async () => {
      const res = await verifyPin({ membershipId: employee.id, pin });
      if (res.ok) {
        pinRef.current = pin;
        setStep('device');
        void flushQueue();
      } else {
        setError(res.error);
        setPin('');
      }
    });
  }

  function submit() {
    if (!employee || !device) return;
    const parsed = Number(value);
    if (value === '' || Number.isNaN(parsed)) {
      setError('Zadaj teplotu.');
      return;
    }
    setError(null);
    touch();

    const clientUuid = crypto.randomUUID();
    const capturedAt = new Date().toISOString();

    startTransition(async () => {
      try {
        const res = await submitMeasurement({
          membershipId: employee.id,
          pin: pinRef.current || pin,
          deviceId: device.id,
          valueC: parsed,
          note: note.trim() || undefined,
          clientUuid,
          clientMeasuredAt: capturedAt,
        });
        if (res.ok) {
          setSavedValue(parsed);
          setSavedOffline(false);
          setResult(res);
          setDoneCount((c) => c + 1);
          setStep('result');
        } else {
          setError(res.error);
        }
      } catch {
        // Výpadok siete — meranie sa nesmie stratiť.
        if (!queueSupported()) {
          setError('Bez pripojenia a toto zariadenie nevie ukladať offline.');
          return;
        }
        try {
          await enqueue({
            id: clientUuid,
            membershipId: employee.id,
            deviceId: device.id,
            deviceName: device.name,
            valueC: parsed,
            note: note.trim() || null,
            capturedAt,
          });
          await refreshPending();
          setSavedValue(parsed);
          setSavedOffline(true);
          // Limit vieme aj offline (server ho poslal pri načítaní zoznamu),
          // takže operátor hneď vidí, či má konať.
          const out =
            (device.minC != null && parsed < device.minC) ||
            (device.maxC != null && parsed > device.maxC);
          setResult({
            ok: true,
            status: out ? 'alarm' : 'ok',
            minC: device.minC,
            maxC: device.maxC,
          });
          setDoneCount((c) => c + 1);
          setStep('result');
        } catch {
          setError('Meranie sa nepodarilo uložiť. Skús znova.');
        }
      }
    });
  }

  function confirmSkip() {
    if (!employee || !device) return;
    if (skipReason.trim().length === 0) {
      setError('Uveď dôvod.');
      return;
    }
    setError(null);
    touch();
    startTransition(async () => {
      try {
        const res = await skipCheck({
          membershipId: employee.id,
          pin: pinRef.current || pin,
          deviceId: device.id,
          reason: skipReason.trim(),
        });
        if (res.ok) continueMeasuring();
        else setError(res.error);
      } catch {
        setError('Bez pripojenia sa preskočenie nedá zapísať.');
      }
    });
  }

  function pinKey(k: string) {
    touch();
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (pin.length < 8) setPin((p) => p + k);
  }

  function valueKey(k: string) {
    touch();
    setError(null);
    if (k === 'back') {
      setValue((v) => v.slice(0, -1));
    } else if (k === '±') {
      setValue((v) => (v.startsWith('-') ? v.slice(1) : '-' + v));
    } else if (k === ',') {
      setValue((v) => (v.includes('.') || v === '' || v === '-' ? v : v + '.'));
    } else {
      setValue((v) => {
        const digits = v.replace(/[^0-9]/g, '');
        const decimals = v.split('.')[1];
        if (decimals !== undefined && decimals.length >= 1) return v;
        if (!v.includes('.') && digits.length >= 3) return v;
        return v + k;
      });
    }
  }

  const header = (
    <header className="flex w-full max-w-2xl items-center justify-between px-2">
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-white/40">{kioskName}</span>
        {employee && step !== 'pin' && (
          <span className="text-sm font-semibold text-white/80">
            {employee.display_name}
            {doneCount > 0 && (
              <span className="ml-2 rounded-full bg-ok/20 px-2 py-0.5 text-xs text-ok">
                {doneCount} ✓
              </span>
            )}
          </span>
        )}
      </div>
      {employee ? (
        <button
          type="button"
          onClick={lockSession}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/70 transition-colors duration-150 active:bg-white/20"
        >
          {step === 'pin' ? 'Zrušiť' : 'Odhlásiť'}
        </button>
      ) : (
        // Odhlásiť celú prevádzku sa dá len vtedy, keď nikto nemeria —
        // uprostred merania by to bolo tlačidlo, ktoré zahodí rozrobenú prácu.
        <button
          type="button"
          onClick={() => {
            startTransition(async () => {
              await logoutKiosk();
              router.refresh();
            });
          }}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/70 transition-colors duration-150 active:bg-white/20"
        >
          Odhlásiť prevádzku
        </button>
      )}
    </header>
  );

  const queueBanner =
    pendingCount > 0 ? (
      <p
        role="status"
        className="w-full max-w-2xl rounded-xl bg-warn/15 px-4 py-2 text-center text-sm text-warn"
      >
        {flushing
          ? `Odosielam ${pendingCount} uložených meraní…`
          : pinRef.current
            ? `${pendingCount} meraní čaká na odoslanie.`
            : `${pendingCount} meraní čaká na odoslanie — prihlás sa PIN-om.`}
      </p>
    ) : null;

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-ink p-4 pt-6 text-white">
      {header}
      {queueBanner}

      {step === 'employee' && (
        <>
          <h1 className="text-2xl font-bold">Kto meria?</h1>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
            {employees.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  touch();
                  setEmployee(e);
                  setPin('');
                  setStep('pin');
                }}
                className="rounded-2xl bg-steel px-4 py-6 text-lg font-semibold transition-colors duration-150 active:bg-white/25"
              >
                {e.display_name}
              </button>
            ))}
            {employees.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/20 p-8 text-center text-white/50">
                <p className="text-lg">Zatiaľ žiadni zamestnanci</p>
                <p className="mt-1 text-sm">Pridaj ich v administrácii → Zamestnanci.</p>
              </div>
            )}
          </div>
        </>
      )}

      {step === 'pin' && employee && (
        <>
          <h1 className="text-2xl font-bold">{employee.display_name} — PIN</h1>
          <p className="text-sm text-white/50">PIN zadávaš iba raz — potom meriaš bez prerušenia.</p>
          <div className="text-4xl tracking-[0.5em]" aria-label={`Zadaných ${pin.length} číslic`}>
            {pin.length === 0 ? (
              <span className="text-white/30">••••</span>
            ) : (
              '•'.repeat(pin.length)
            )}
          </div>
          {error && (
            <p role="alert" className="max-w-sm text-center text-danger">
              {error}
            </p>
          )}
          <Keypad
            keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', '']}
            onKey={pinKey}
          />
          <button
            type="button"
            onClick={checkPin}
            disabled={pending || pin.length < 4}
            className="w-full max-w-sm rounded-2xl bg-ok py-5 text-2xl font-bold transition-opacity duration-150 disabled:opacity-40"
          >
            {pending ? 'Overujem…' : 'Ďalej'}
          </button>
        </>
      )}

      {step === 'device' && (
        <>
          <h1 className="text-2xl font-bold">Ktoré zariadenie?</h1>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {devices.map((d) => {
              const trend = trendArrow(d.lastValue, d.prevValue);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    touch();
                    setDevice(d);
                    setValue('');
                    setNote('');
                    setStep('value');
                  }}
                  className="flex items-center justify-between rounded-2xl bg-steel px-5 py-5 text-left transition-colors duration-150 active:bg-white/25"
                >
                  <span>
                    <span className="block text-lg font-semibold">{d.name}</span>
                    <span className="block text-sm text-white/50">
                      {d.type_name} · {timeAgo(d.lastAt)}
                    </span>
                  </span>
                  <span className="text-right">
                    {d.measuredToday ? (
                      <span
                        className={`block text-lg font-bold ${
                          d.lastStatus === 'alarm' ? 'text-danger' : 'text-ok'
                        }`}
                      >
                        {fmt(d.lastValue)}
                        {trend && (
                          <span className="ml-1 text-white/50" aria-hidden="true">
                            {trend}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="block rounded-full bg-warn/20 px-2.5 py-1 text-xs font-semibold text-warn">
                        {d.dueToday ? 'dnes odmerať' : 'neodmerané'}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {devices.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/20 p-8 text-center text-white/50">
                <p className="text-lg">Zatiaľ žiadne zariadenia</p>
                <p className="mt-1 text-sm">Pridaj ich v administrácii → Zariadenia.</p>
              </div>
            )}
          </div>
        </>
      )}

      {step === 'value' && device && (
        <>
          <h1 className="text-2xl font-bold">{device.name}</h1>
          <p className="text-sm text-white/50">
            Limit: {fmt(device.minC)} až {fmt(device.maxC)}
            {device.lastValue != null && <> · minule {fmt(device.lastValue)}</>}
          </p>
          <div className="text-5xl font-bold" aria-live="polite">
            {value === '' ? <span className="text-white/30">0</span> : value.replace('.', ',')}
            <span className="ml-2 text-3xl text-white/50">°C</span>
          </div>
          {error && (
            <p role="alert" className="max-w-sm text-center text-danger">
              {error}
            </p>
          )}
          <Keypad
            keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', '±', '0', ',']}
            onKey={valueKey}
          />
          <div className="flex w-full max-w-sm gap-3">
            <button
              type="button"
              onClick={() => valueKey('back')}
              aria-label="Vymazať poslednú číslicu"
              className="flex-1 rounded-2xl bg-steel py-5 text-2xl font-bold transition-colors duration-150 active:bg-white/25"
            >
              ⌫
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || value === '' || value === '-'}
              className="flex-[2] rounded-2xl bg-ok py-5 text-2xl font-bold transition-opacity duration-150 disabled:opacity-40"
            >
              {pending ? 'Ukladám…' : 'Uložiť'}
            </button>
          </div>
          <div className="flex w-full max-w-sm gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                touch();
                setStep('note');
              }}
              className="flex-1 rounded-xl bg-white/10 py-3 text-white/70 transition-colors duration-150 active:bg-white/20"
            >
              {note.trim() ? 'Poznámka ✓' : 'Pridať poznámku'}
            </button>
            <button
              type="button"
              onClick={() => {
                touch();
                setSkipReason('');
                setStep('skip');
              }}
              className="flex-1 rounded-xl bg-white/10 py-3 text-white/70 transition-colors duration-150 active:bg-white/20"
            >
              Nedá sa odmerať
            </button>
          </div>
        </>
      )}

      {step === 'note' && device && (
        <>
          <h1 className="text-2xl font-bold">Poznámka</h1>
          <p className="text-sm text-white/50">{device.name}</p>
          <textarea
            value={note}
            onChange={(e) => {
              touch();
              setNote(e.target.value);
            }}
            maxLength={500}
            autoFocus
            aria-label="Poznámka k meraniu"
            placeholder="Napr. dvere boli otvorené počas dodávky"
            className="min-h-32 w-full max-w-sm rounded-2xl bg-steel p-4 text-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <button
            type="button"
            onClick={() => {
              touch();
              setStep('value');
            }}
            className="w-full max-w-sm rounded-2xl bg-ok py-5 text-2xl font-bold"
          >
            Hotovo
          </button>
        </>
      )}

      {step === 'skip' && device && (
        <>
          <h1 className="text-2xl font-bold">Prečo sa nedá odmerať?</h1>
          <p className="text-sm text-white/50">{device.name}</p>
          <div className="grid w-full max-w-sm gap-2">
            {['Zariadenie je vypnuté', 'Prevádzka zatvorená', 'Porucha teplomera'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  touch();
                  setSkipReason(r);
                }}
                className={`rounded-xl px-4 py-3 text-left transition-colors duration-150 ${
                  skipReason === r ? 'bg-ok font-semibold' : 'bg-steel active:bg-white/25'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={skipReason}
            onChange={(e) => {
              touch();
              setSkipReason(e.target.value);
            }}
            maxLength={500}
            aria-label="Dôvod preskočenia"
            placeholder="alebo napíš vlastný dôvod"
            className="min-h-24 w-full max-w-sm rounded-2xl bg-steel p-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          {error && (
            <p role="alert" className="max-w-sm text-center text-danger">
              {error}
            </p>
          )}
          <div className="flex w-full max-w-sm gap-3">
            <button
              type="button"
              onClick={() => {
                touch();
                setError(null);
                setStep('value');
              }}
              className="flex-1 rounded-2xl bg-steel py-4 font-semibold"
            >
              Späť
            </button>
            <button
              type="button"
              onClick={confirmSkip}
              disabled={pending || skipReason.trim().length === 0}
              className="flex-[2] rounded-2xl bg-warn py-4 text-lg font-bold disabled:opacity-40"
            >
              {pending ? 'Zapisujem…' : 'Zapísať dôvod'}
            </button>
          </div>
        </>
      )}

      {step === 'result' && result && device && (
        <button
          type="button"
          onClick={continueMeasuring}
          role="status"
          aria-live="assertive"
          className={`flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 rounded-3xl transition-colors duration-200 ${
            result.status === 'ok' ? 'bg-ok' : 'bg-danger'
          }`}
        >
          <span aria-hidden="true" className="text-7xl">
            {result.status === 'ok' ? '✓' : '⚠'}
          </span>
          <span className="text-3xl font-bold">
            {device.name}: {savedValue != null ? fmt(savedValue) : ''}
          </span>
          <span className="text-xl font-semibold">
            {result.status === 'ok' ? 'Zapísané — OK' : 'ALARM — mimo limitu!'}
          </span>
          {result.status === 'alarm' && (
            <span className="text-lg text-white/80">
              Limit: {fmt(result.minC)} až {fmt(result.maxC)}. Informuj vedúceho.
            </span>
          )}
          {savedOffline && (
            <span className="rounded-full bg-black/20 px-3 py-1 text-sm">
              Bez pripojenia — uložené v tablete, odošle sa samo
            </span>
          )}
          <span className="text-sm text-white/70">Pokračujem na ďalšie zariadenie…</span>
        </button>
      )}
    </main>
  );
}
