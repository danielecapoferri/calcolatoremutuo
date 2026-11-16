# Calcolatore importo mutuo · Immobiliare.it Mutui (prototipo)

Pagina statica, nessuna build: `index.html`, `style.css` e `app.js`.

## Pubblicare con GitHub Pages
1. Crea un repository e carica il contenuto di questa cartella nella root.
2. In **Settings → Pages**, scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`.
3. Dopo un minuto la pagina è online su `https://<utente>.github.io/<repo>/`.

Il link "Condividi risultati" usa automaticamente l'indirizzo della pagina e aggiunge i dati inseriti
(es. `?reddito=2500&anticipo=60000&comune=roma&durata=30&tasso=3.5`). Chi apre il link vede gli stessi risultati.

## Asset
Icone, logo e mascotte sono gli SVG esportati da Figma (file Website e Design System), senza ridisegni:
- icone: inline in `index.html` e in `window.ICONS`
- `assets/logo.svg`: logo dell'header
- `assets/immo-lente.svg`: mascotte Immo con lente (Design System), ritagliata nel cerchio come nelle schermate

## Parametri modificabili (`app.js`, oggetto `CFG` e `COMUNI`)
- Rapporto rata/reddito: default 30%, slider 25–40% con aggancio su 30/33/40
- LTV 80%; con anticipo sotto 5.000€ si passa al 100%
- "Usa tutto l'anticipo" attivo se il prezzo casa salirebbe di almeno 10.000€
- Mutuo green: tasso −0,2 punti
- Prezzi medi €/m²: Roma 3.300, Milano 5.300, Torino 2.000
- Spese accessorie: funzione `speseAccessorie()`, regole dell'info point

## Variante B (`/v2/`)
La cartella `v2` contiene la seconda versione del calcolatore: stessi file di stile, script e asset della versione principale, ma i numeri si aggiornano solo quando si rilascia lo slider e la card “Stima tipo immobile” della vista m² ha il nuovo layout con planimetria. Online è raggiungibile aggiungendo `v2/` all'indirizzo della versione principale.
