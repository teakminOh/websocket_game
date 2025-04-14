# WebSocket Preteky - Online Hra pre Dvoch Hráčov

Toto je jednoduchá online pretekárska hra pre dvoch hráčov vytvorená pomocou WebSocketov, HTML Canvas a Node.js.

## Ako hrať

1.  **Spustenie Servera:**
    *   Uistite sa, že máte nainštalovaný [Node.js](https://nodejs.org/).
    *   V termináli prejdite do priečinka projektu (`websocket-race-game`).
    *   Nainštalujte závislosti: `npm install`
    *   Spustite server: `node server.js`
    *   Server bude bežať na porte 8080 (predvolene).

2.  **Pripojenie Hráčov:**
    *   Otvorte súbor `public/index.html` vo vašom webovom prehliadači (napr. dvojklikom alebo cez lokálny web server). Hra sa pokúsi pripojiť k `ws://localhost:8080` (alebo zodpovedajúcej adrese, ak server beží inde).
    *   Otvorte tú istú adresu v druhom okne prehliadača alebo na druhom počítači v rovnakej sieti.
    *   Hra je určená pre presne dvoch hráčov. Prvý pripojený hráč bude mať modrú farbu, druhý červenú.

3.  **Nastavenie Hry:**
    *   Keď sa pripoja obaja hráči, hráč 1 (modrý) dostane výzvu na zadanie počtu kôl (1-10). Predvolená hodnota sú 3 kolá.
    *   Po potvrdení počtu kôl sa začne krátke odpočítavanie (3 sekundy).

4.  **Ovládanie:**
    *   Použite nasledujúce klávesy na ovládanie vášho vozidla:
        *   **Šípka HORE / W:** Zrýchlenie dopredu
        *   **Šípka DOLE / S:** Brzda / Cúvanie
        *   **Šípka VĽAVO / A:** Zatáčanie doľava
        *   **Šípka VPRAVO / D:** Zatáčanie doprava

5.  **Cieľ Hry:**
    *   Prejdite stanovený počet kôl čo najrýchlejšie.
    *   Trať je eliptická. Kolo sa počíta pri prejazde štartovacou/cieľovou čiarou (biela čiara) v správnom smere (proti smeru hodinových ručičiek, začínajúc vpravo).

6.  **Pravidlá a Penalizácie:**
    *   **Široká Trať:** Trať (šedá plocha) je dostatočne široká na obiehanie.
    *   **Opustenie Trate:** Ak vyjdete mimo šedú plochu trate, vaše vozidlo bude na krátky čas výrazne spomalené (penalizácia). Počas penalizácie bude okolo vášho vozidla oranžový rámček.
    *   **Kolízia Zozadu:** Ak narazíte do súpera zozadu, budete penalizovaný (výrazné spomalenie na krátky čas). Snažte sa obiehať bezpečne! Kolízie zboku alebo čelné nie sú penalizované (ale môžu vás spomaliť).

7.  **Koniec Hry:**
    *   Hra končí, keď obaja hráči dokončia stanovený počet kôl.
    *   Po skončení hry sa zobrazia výsledné časy oboch hráčov.
    *   Ak sa jeden z hráčov odpojí počas hry, hra sa okamžite skončí.
    *   Server sa po krátkej chvíli (cca 10 sekúnd po zobrazení výsledkov) automaticky resetuje a je pripravený na novú hru (hráči sa musia znova pripojiť otvorením `index.html`).

## Technológie

*   **Backend:** Node.js, `ws` (WebSocket knižnica)
*   **Frontend:** HTML, CSS, JavaScript (Canvas API pre kreslenie)
*   **Komunikácia:** WebSockets

Veľa šťastia a zábavy pri pretekaní!