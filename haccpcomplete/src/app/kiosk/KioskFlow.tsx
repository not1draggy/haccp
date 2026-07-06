'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { submitMeasurement, verifyPin, type SubmitResult } from './actions';

export type KioskEmployee = { id: string; display_name: string };
export type KioskDevice = { id: string; name: string; type_name: string };

type Step = 'employee' | 'pin' | 'device' | 'value' | 'result';

const RESET_AFTER_MS = 5000;

function Keypad({
  onKey,
  keys,
}: {
  onKey: (k: string) => void;
  keys: string[];
}) {
  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-3">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className="rounded-2xl bg-steel py-5 text-2xl font-bold text-white active:bg-white/20"
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
  const [value, setValue] = useState(''); // textová reprezentácia, napr. "-18.5"
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetAll() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStep('employee');
    setEmployee(null);
    setPin('');
    setDevice(null);
    setValue('');
    setError(null);
    setResult(null);
  }

  useEffect(() => {
    if (step === 'result') {
      resetTimer.current = setTimeout(resetAll, RESET_AFTER_MS);
      return () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
      };
    }
  }, [step]);

  function checkPin() {
    if (!employee) return;
    setError(null);
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
    startTransition(async () => {
      const res = await submitMeasurement({
        membershipId: employee.id,
        pin,
        deviceId: device.id,
        valueC: parsed,
      });
      if (res.ok) {
        setResult(res);
        setStep('result');
      } else {
        setError(res.error);
      }
    });
  }

  function pinKey(k: string) {
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (pin.length < 8) setPin((p) => p + k);
  }

  function valueKey(k: string) {
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
    <header className="flex w-full items-center justify-between px-2">
      <span className="text-sm text-white/40">{kioskName}</span>
      {step !== 'employee' && (
        <button
          type="button"
          onClick={resetAll}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/70"
        >
          Zrušiť
        </button>
      )}
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
                  setEmployee(e);
                  setPin('');
                  setStep('pin');
                }}
                className="rounded-2xl bg-steel px-4 py-6 text-lg font-semibold active:bg-white/20"
              >
                {e.display_name}
              </button>
            ))}
            {employees.length === 0 && (
              <p className="col-span-full text-center text-white/50">
                Žiadni zamestnanci — pridaj ich v administrácii.
              </p>
            )}
          </div>
        </>
      )}

      {step === 'pin' && employee && (
        <>
          <h1 className="text-2xl font-bold">{employee.display_name} — PIN</h1>
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
            onKey={(k) => k !== '' && pinKey(k)}
          />
          <button
            type="button"
            onClick={checkPin}
            disabled={pending || pin.length < 4}
            className="w-full max-w-sm rounded-2xl bg-ok py-5 text-2xl font-bold disabled:opacity-40"
          >
            {pending ? 'Overujem…' : 'Ďalej'}
          </button>
        </>
      )}

      {step === 'device' && (
        <>
          <h1 className="text-2xl font-bold">Ktoré zariadenie?</h1>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDevice(d);
                  setValue('');
                  setStep('value');
                }}
                className="rounded-2xl bg-steel px-4 py-6 active:bg-white/20"
              >
                <span className="block text-lg font-semibold">{d.name}</span>
                <span className="block text-sm text-white/50">{d.type_name}</span>
              </button>
            ))}
            {devices.length === 0 && (
              <p className="col-span-full text-center text-white/50">
                Žiadne zariadenia — pridaj ich v administrácii.
              </p>
            )}
          </div>
        </>
      )}

      {step === 'value' && device && (
        <>
          <h1 className="text-2xl font-bold">{device.name} — teplota</h1>
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
              className="flex-1 rounded-2xl bg-steel py-5 text-2xl font-bold"
            >
              ⌫
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || value === '' || value === '-'}
              className="flex-[2] rounded-2xl bg-ok py-5 text-2xl font-bold disabled:opacity-40"
            >
              {pending ? 'Ukladám…' : 'Uložiť'}
            </button>
          </div>
        </>
      )}

      {step === 'result' && result && (
        <button
          type="button"
          onClick={resetAll}
          className={`flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 rounded-3xl ${
            result.status === 'ok' ? 'bg-ok' : 'bg-danger'
          }`}
        >
          <span className="text-7xl">{result.status === 'ok' ? '✓' : '⚠'}</span>
          <span className="text-3xl font-bold">
            {result.status === 'ok' ? 'Zapísané — OK' : 'ALARM — mimo limitu!'}
          </span>
          {result.status === 'alarm' && (
            <span className="text-lg text-white/80">
              Limit: {result.minC != null ? `${result.minC} °C` : '—'} až{' '}
              {result.maxC != null ? `${result.maxC} °C` : '—'}. Informuj vedúceho.
            </span>
          )}
          <span className="text-sm text-white/60">Ťukni pre ďalšie meranie</span>
        </button>
      )}
    </main>
  );
}
