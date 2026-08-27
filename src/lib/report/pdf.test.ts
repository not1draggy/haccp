import { describe, expect, it } from 'vitest';
import { renderReport, type ReportData } from './pdf';

const vzorka: ReportData = {
  firma: 'Reštaurácia Ľaliová š.r.o.',
  prevadzka: 'Hlavná prevádzka',
  od: new Date('2026-07-01T00:00:00Z'),
  do: new Date('2026-07-31T23:59:59Z'),
  zmeskane: 2,
  preskocene: 1,
  orezanych: 0,
  merania: [
    {
      measured_at: '2026-07-15T08:12:00Z',
      value_c: 4,
      status: 'ok',
      device_name: 'Chladnička kuchyňa',
      employee_name: 'Anna Kuchárková',
      corrective_actions: [],
    },
    {
      measured_at: '2026-07-16T09:30:00Z',
      value_c: 12.5,
      status: 'alarm',
      device_name: 'Mraznička sklad',
      employee_name: 'Ľuboš Ďurič',
      corrective_actions: [
        { action: 'Presunuté do náhradnej mrazničky', created_at: '2026-07-16T09:45:00Z' },
      ],
    },
    {
      measured_at: '2026-07-17T07:05:00Z',
      value_c: 9,
      status: 'alarm',
      device_name: 'Teplý pult',
      employee_name: 'Žofia Ťažká',
      corrective_actions: [],
    },
  ],
};

describe('PDF report', () => {
  it('vyrenderuje platné PDF', async () => {
    const buf = await renderReport(vzorka);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(3000);
  });

  it('vloží vlastný font — zabudovaný Helvetica nevie slovenskú diakritiku', async () => {
    const buf = await renderReport(vzorka);
    expect(buf.toString('latin1')).toContain('DejaVu');
  });

  it('zvládne prázdne obdobie bez pádu', async () => {
    const buf = await renderReport({ ...vzorka, merania: [] });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
