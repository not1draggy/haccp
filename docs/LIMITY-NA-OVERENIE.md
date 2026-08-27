# Limity na právnu verifikáciu

Podklad pre odborníka na potravinovú legislatívu. Cieľom je, aby k **každému
limitu** pribudol overený právny odkaz, ktorý sa zapíše do stĺpca
`rules.legal_ref`.

> **Upozornenie pre čitateľa aj pre odborníka**
>
> Zdroje navrhnuté v stĺpci „Kandidát na overenie" **nie sú overené**. Zostavil
> ich vývojár, nie právnik, a slúžia výhradne ako štartovací bod rešerše, aby
> odborník nezačínal od prázdnej stránky. **Nekopírovať do `legal_ref` bez
> potvrdenia.** Ak je navrhnutý predpis nesprávny alebo neplatný, je to
> očakávaný výsledok tejto revízie, nie chyba, ktorú treba zamlčať.

## Prečo to blokuje predaj

Aplikácia pri každom meraní vyhodnotí, či je hodnota v limite, a výsledok
(`ok` / `alarm`) zapíše do denníka natrvalo — merania sú append-only a nedajú
sa opraviť ani zmazať. Denník je podkladom pri kontrole RVPS. Ak je limit
nesprávny, aplikácia **systematicky a nezvratne** produkuje nesprávne
vyhodnotené záznamy, a to bez akéhokoľvek viditeľného príznaku: zákazník vidí
zelené „OK" a domnieva sa, že je v poriadku.

## Súčasné limity v systéme

Zdroj: `supabase/migrations/0002_seed_rules.sql`, verzia platná od 2020-01-01
s otvoreným koncom. Stav `legal_ref` u všetkých štyroch: `TODO`.

| # | Typ zariadenia | Limit v systéme | Na čom je založený | Kandidát na overenie (NEOVERENÉ) |
|---|---|---|---|---|
| 1 | Chladnička | 0 °C až +5 °C | Bežná prax pre chladené potraviny | Potravinový kódex SR; Nar. (ES) č. 852/2004, príloha II kap. IX |
| 2 | Mraznička | ≤ −18 °C | Štandard pre mrazené potraviny | Nar. (ES) č. 853/2004; predpisy k rýchlo zmrazeným potravinám |
| 3 | Teplý pult / výdaj | ≥ +60 °C | Bežná prax pre teplý výdaj | Vyhláška MZ SR č. 533/2007 Z. z. (zariadenia spoločného stravovania) |
| 4 | Chladiaca vitrína | 0 °C až +5 °C | Odvodené od chladničky | ako #1 — overiť, či vitrína nemá odlišný režim |

## Otázky, na ktoré potrebujeme odpoveď

1. **Sú hodnoty správne a úplné?** Ak predpis určuje limit pre konkrétnu
   komoditu (mäso, mlieko, hydina, ryby) prísnejšie než všeobecný limit,
   povedzte to — systém vie mať samostatný typ zariadenia pre každý režim.
2. **Aká je presná citácia?** Ideálne v tvare „predpis, paragraf/príloha,
   znenie k dátumu". Text ide 1:1 do `legal_ref` a zobrazuje sa pri kontrole.
3. **Od kedy hodnota platí?** Limity sú v systéme verzované
   (`valid_from` / `valid_to`) a meranie si drží väzbu na verziu, podľa ktorej
   bolo vyhodnotené — zmena predpisu nikdy spätne neprepíše históriu. Ak sa
   niektorý limit v minulosti menil, vieme zapísať aj staršiu verziu.
4. **Chýba nejaký typ zariadenia**, ktorý gastro prevádzka bežne meria
   a v tabuľke nie je? (napr. šokové chladenie, rozmrazovanie, prevoz jedla)
5. **Sú tolerancie prípustné?** Napr. krátkodobé prekročenie počas dodávky
   alebo rozmrazovania. Dnes systém pozná len „v limite / mimo limitu";
   ak legislatíva pozná toleranciu, treba to premietnuť do návrhu.

## Ako sa výsledok zapíše do systému

Zmena limitu je **migrácia**, nie úprava cez administráciu — limity sú
legislatíva spoločná pre všetkých zákazníkov a cez API ich zámerne nemení
nikto (bezpečnostný audit, migrácia `0016`).

```sql
-- Doplnenie citácie k existujúcemu limitu:
update public.rules
   set legal_ref = 'presná citácia od odborníka'
 where device_type_id = 'a0000000-0000-0000-0000-000000000001';

-- Zmena hodnoty limitu = uzavrieť starú verziu a vložiť novú.
-- Staré merania si ponechajú väzbu na verziu, podľa ktorej boli vyhodnotené.
update public.rules
   set valid_to = '2026-12-31'
 where device_type_id = 'a0000000-0000-0000-0000-000000000001'
   and valid_to is null;

insert into public.rules (device_type_id, min_c, max_c, legal_ref, valid_from)
values ('a0000000-0000-0000-0000-000000000001', 0.0, 4.0,
        'presná citácia', '2027-01-01');
```

## Poznámka k vlastným limitom zariadení

Prevádzka si vie na konkrétnom zariadení nastaviť **prísnejší vlastný limit**
(`devices.min_c` / `devices.max_c`), ktorý má prednosť pred globálnym
pravidlom. To je funkcia pre interné normy prevádzky — **nenahrádza** legislatívny
limit a nemá vplyv na otázky vyššie.
