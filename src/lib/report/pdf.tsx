import 'server-only';
import path from 'node:path';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

// Zabudované PDF fonty (Helvetica) nevedia slovenskú diakritiku — sú v kódovaní
// WinAnsi, ktoré nepozná č, š, ž, ľ, ť ani ô. Report pre RVPS s „Chladnicka
// kuchyna" namiesto „Chladnička kuchyňa" je nepoužiteľný, takže font musí byť
// vlastný. DejaVu je orezaná na latinku + Latin Extended-A: 760 kB → 22 kB.
const FONTY = path.join(process.cwd(), 'src', 'lib', 'report', 'fonts');

Font.register({
  family: 'DejaVu',
  fonts: [
    { src: path.join(FONTY, 'DejaVuSans.ttf') },
    { src: path.join(FONTY, 'DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
  ],
});

// Delenie dlhých slov bez slovníka — inak react-pdf láme názvy zariadení
// na náhodných miestach.
Font.registerHyphenationCallback((slovo) => [slovo]);

export type ReportMeranie = {
  measured_at: string;
  value_c: number;
  status: 'ok' | 'alarm';
  device_name: string;
  employee_name: string;
  corrective_actions: { action: string; created_at: string }[];
};

export type ReportData = {
  firma: string;
  prevadzka: string;
  od: Date;
  do: Date;
  merania: ReportMeranie[];
  zmeskane: number;
  preskocene: number;
  /** Merania nad rámec limitu 10 000 riadkov, ktoré sa do reportu nezmestili. */
  orezanych: number;
};

const S = StyleSheet.create({
  page: { fontFamily: 'DejaVu', fontSize: 8, padding: 28, color: '#1f2933' },
  h1: { fontSize: 15, fontWeight: 'bold' },
  podnadpis: { fontSize: 9, color: '#52606d', marginTop: 3 },
  hlavicka: { borderBottomWidth: 1.5, borderBottomColor: '#1f2933', paddingBottom: 8 },

  suhrnRiadok: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 },
  dlazdica: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd2d9',
    borderRadius: 3,
    padding: 6,
  },
  dlazdicaCislo: { fontSize: 14, fontWeight: 'bold' },
  dlazdicaPopis: { fontSize: 7, color: '#52606d', marginTop: 2 },

  thead: {
    flexDirection: 'row',
    backgroundColor: '#1f2933',
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontWeight: 'bold',
    fontSize: 7.5,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e4e7eb',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  trAlarm: { backgroundColor: '#fdf2f2' },

  cDatum: { width: '17%' },
  cZariadenie: { width: '23%' },
  cTeplota: { width: '11%', textAlign: 'right', paddingRight: 6 },
  cStav: { width: '9%' },
  cMeral: { width: '17%' },
  cOpatrenie: { width: '23%' },

  alarm: { color: '#b91c1c', fontWeight: 'bold' },
  bezOpatrenia: { color: '#b91c1c' },

  pata: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: '#7b8794',
    borderTopWidth: 0.5,
    borderTopColor: '#cbd2d9',
    paddingTop: 5,
  },
});

function datum(d: Date | string) {
  return new Date(d).toLocaleDateString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function datumCas(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Dlazdica({ cislo, popis }: { cislo: string; popis: string }) {
  return (
    <View style={S.dlazdica}>
      <Text style={S.dlazdicaCislo}>{cislo}</Text>
      <Text style={S.dlazdicaPopis}>{popis}</Text>
    </View>
  );
}

export function ReportDocument(d: ReportData) {
  const alarmy = d.merania.filter((m) => m.status === 'alarm');
  // Alarm bez zápisu opatrenia je presne to, na čo sa kontrola pýta.
  const alarmyBezOpatrenia = alarmy.filter((m) => m.corrective_actions.length === 0);

  return (
    <Document
      title={`HACCP report ${d.prevadzka} ${datum(d.od)}–${datum(d.do)}`}
      author={d.firma}
      language="sk"
    >
      <Page size="A4" style={S.page}>
        <View style={S.hlavicka}>
          <Text style={S.h1}>Denník teplôt — HACCP</Text>
          <Text style={S.podnadpis}>
            {d.firma} · {d.prevadzka}
          </Text>
          <Text style={S.podnadpis}>
            Obdobie {datum(d.od)} – {datum(d.do)} · vygenerované{' '}
            {datumCas(new Date().toISOString())}
          </Text>
        </View>

        <View style={S.suhrnRiadok}>
          <Dlazdica cislo={String(d.merania.length)} popis="meraní" />
          <Dlazdica cislo={String(alarmy.length)} popis="mimo limitu" />
          <Dlazdica cislo={String(alarmyBezOpatrenia.length)} popis="bez opatrenia" />
          <Dlazdica cislo={String(d.zmeskane)} popis="zmeškaných kontrol" />
          <Dlazdica cislo={String(d.preskocene)} popis="preskočených" />
        </View>

        {alarmyBezOpatrenia.length > 0 && (
          <Text style={{ ...S.bezOpatrenia, marginBottom: 8, fontSize: 8 }}>
            Pozor: {alarmyBezOpatrenia.length} prekročení limitu nemá zapísané
            nápravné opatrenie.
          </Text>
        )}

        <View style={S.thead} fixed>
          <Text style={S.cDatum}>Dátum a čas</Text>
          <Text style={S.cZariadenie}>Zariadenie</Text>
          <Text style={S.cTeplota}>Teplota</Text>
          <Text style={S.cStav}>Stav</Text>
          <Text style={S.cMeral}>Meral</Text>
          <Text style={S.cOpatrenie}>Nápravné opatrenie</Text>
        </View>

        {d.merania.map((m, i) => (
          <View
            key={`${m.measured_at}-${i}`}
            style={m.status === 'alarm' ? { ...S.tr, ...S.trAlarm } : S.tr}
            wrap={false}
          >
            <Text style={S.cDatum}>{datumCas(m.measured_at)}</Text>
            <Text style={S.cZariadenie}>{m.device_name}</Text>
            <Text style={S.cTeplota}>
              {Number(m.value_c).toLocaleString('sk-SK')} °C
            </Text>
            <Text style={m.status === 'alarm' ? { ...S.cStav, ...S.alarm } : S.cStav}>
              {m.status === 'alarm' ? 'ALARM' : 'OK'}
            </Text>
            <Text style={S.cMeral}>{m.employee_name}</Text>
            <Text
              style={
                m.status === 'alarm' && m.corrective_actions.length === 0
                  ? { ...S.cOpatrenie, ...S.bezOpatrenia }
                  : S.cOpatrenie
              }
            >
              {m.corrective_actions.length > 0
                ? m.corrective_actions.map((a) => a.action).join(' · ')
                : m.status === 'alarm'
                  ? 'nezapísané'
                  : ''}
            </Text>
          </View>
        ))}

        {d.merania.length === 0 && (
          <Text style={{ marginTop: 14, color: '#52606d' }}>
            Za zvolené obdobie nie sú v denníku žiadne merania.
          </Text>
        )}

        {d.orezanych > 0 && (
          <Text style={{ marginTop: 10, fontSize: 7, color: '#52606d' }}>
            Report zobrazuje najnovších {d.merania.length} meraní; ďalších{' '}
            {d.orezanych} sa doň nezmestilo. Pre kompletné dáta zvoľ kratšie
            obdobie alebo použi CSV export.
          </Text>
        )}

        <View style={S.pata} fixed>
          <Text>
            Záznamy sú append-only — nedajú sa dodatočne meniť ani mazať.
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Strana ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export function renderReport(data: ReportData) {
  return renderToBuffer(<ReportDocument {...data} />);
}
