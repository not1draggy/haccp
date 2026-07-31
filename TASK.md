# TASK.md — čo staviame

## Produkt

Cloudový HACCP systém pre gastro prevádzky (reštaurácie, jedálne, kaviarne).
Nahrádza papierové teplotné denníky, ktoré sa v praxi dopisujú spätne a pri
kontrole neobstoja.

## Kto to používa

| Rola | Kde | Čo potrebuje |
|---|---|---|
| Kuchár / pracovník | tablet v kuchyni, mastné ruky, zhon | odmerať a zapísať pod 10 s, bez učenia |
| Vedúci / majiteľ | mobil alebo notebook | vidieť, či sa meria a či je niečo mimo limitu |
| Kontrolór (RVPS) | export / tlač | dôveryhodná, neprepisovateľná história |

## MVP — definícia hotového

- [x] Multi-tenant schéma s RLS izoláciou
- [x] Append-only merania vynútené na úrovni DB
- [x] Audit log každej mutácie
- [x] Verzované legislatívne limity
- [x] Kiosk: párovanie tabletu, meranie meno → PIN → zariadenie → teplota
- [x] Kiosk: PIN raz za session, plynulé meranie viacerých zariadení za sebou
- [x] Admin: prihlásenie, prehľad alarmov a dnešných meraní
- [x] Admin: správa zariadení vrátane limitov
- [x] Admin: správa zamestnancov a PIN kódov
- [x] Admin: správa kioskov a párovacích kódov
- [x] Nasadenie na produkciu (Vercel + Supabase)
- [ ] Export histórie pre kontrolu (CSV / PDF)
- [ ] Nápravné opatrenia pri alarme (čo sa urobilo)

Bez posledných dvoch je systém použiteľný na zber dát, ale **nie na obhájenie
sa pred kontrolou** — preto sú MVP-kritické.

## Nefunkčné požiadavky

- Meranie pod 10 sekúnd, veľké dotykové plochy, funkčné mastnými prstami.
- Mobile-first, ale plne použiteľné na desktope.
- Kuchyňa má slabú wifi → počítať s výpadkami (offline queue je v roadmape).
- Slovenské UI, formáty dátumu a čísel `sk-SK`, časová zóna Europe/Bratislava.

## Právne upozornenie

Seedované limity v `0002` sú bežné SK/EU hodnoty pre gastro prax, ale
**pred predajom vyžadujú právnu verifikáciu** a doplnenie `legal_ref` citácií.
Nesmie sa tvrdiť, že systém garantuje súlad s legislatívou, kým to neprejde
kontrolou odborníka.
