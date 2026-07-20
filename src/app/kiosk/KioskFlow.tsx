'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { submitMeasurement, verifyPin, type SubmitResult } from './actions';

export type KioskEmployee = { id: string; display_name: string };
export type KioskDevice = {
  id: string;
  name: string;
  type_name: string;
  minC: number | null;
  maxC: number | null;
  lastValue: number | null;
  lastStatus: 'ok' | 'alarm' | null;
  lastAt: string | null;
  measuredToday: boolean;
};

type Step = 'employee' | 'pin' | 'device' | 'value' | 'result';

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

function Keypad({ onKey, keys }: { onKey: (k: string) => void; keys: string[] }) {
  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-3">
      {keys.map((k, i) => (
        <button
          key={`${k}-${i}`}
          type="button"
          onClick={() => k !== '' && onKey(k)}
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
  const [step, setStep] = useState<Step>('employee');
  const [employee, setEmployee] = useState<KioskEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [device, setDevice] = useState<KioskDevice | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const lastActivity = useRef(Date.now());
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const lockSession = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStep('employee');
    setEmployee(null);
    setPin('');
    setDevice(null);
    setValue('');
    setError(null);
    setResult(null);
    setDoneCount(0);
  }, []);

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

  function continueMeasuring() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    touch();
    setDevice(null);
    setValue('');
    setResult(null);
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
        setStep('device');
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
    startTransition(async () => {
      const res = await submitMeasurement({
        membershipId: employee.id,
        pin,
        deviceId: device.id,
        valueC: parsed,
      });
      if (res.ok) {
        setSavedValue(parsed);
        setResult(res);
        setDoneCount((c) => c + 1);
        setStep('result');
      } else {
        setError(res.error);
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
      ) : null}
    </header>
  );

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-ink p-4 pt-6 text-white">
      {header}

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
          <div className="text-4xl tracking-[0.5em]">
            {pin.length === 0 ? (
              <span className="text-white/30">••••</span>
            ) : (
              '•'.repeat(pin.length)
            )}
          </div>
          {error && <p className="text-danger">{error}</p>}
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
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  touch();
                  setDevice(d);
                  setValue('');
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
                    </span>
                  ) : (
                    <span className="block rounded-full bg-warn/20 px-2.5 py-1 text-xs font-semibold text-warn">
                      dnes odmerať
                    </span>
                  )}
                </span>
              </button>
            ))}
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
            {device.lastValue != null && (
              <>
                {' '}
                · minule {fmt(device.lastValue)}
              </>
            )}
          </p>
          <div className="text-5xl font-bold">
            {value === '' ? <span className="text-white/30">0</span> : value.replace('.', ',')}
            <span className="ml-2 text-3xl text-white/50">°C</span>
          </div>
          {error && <p className="text-danger">{error}</p>}
          <Keypad
            keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', '±', '0', ',']}
            onKey={valueKey}
          />
          <div className="flex w-full max-w-sm gap-3">
            <button
              type="button"
              onClick={() => valueKey('back')}
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
        </>
      )}

      {step === 'result' && result && device && (
        <button
          type="button"
          onClick={continueMeasuring}
          className={`flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 rounded-3xl transition-colors duration-200 ${
            result.status === 'ok' ? 'bg-ok' : 'bg-danger'
          }`}
        >
          <span className="text-7xl">{result.status === 'ok' ? '✓' : '⚠'}</span>
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
          <span className="text-sm text-white/70">Pokračujem na ďalšie zariadenie…</span>
        </button>
      )}
    </main>
  );
}
