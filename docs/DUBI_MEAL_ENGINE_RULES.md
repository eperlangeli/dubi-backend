# DUBI Meal Engine Rules

Versione: `meal-grammar-v1`  
Stato: provvisorio, da validare con nutrizionista.

Questo documento cristallizza i paletti che il DUBI Engine deve seguire per generare pasti sensati, salutari, pratici e coerenti con dieta, sport, fabbisogno energetico, stagionalità e preferenze dell’utente.

Il principio guida è:

> DUBI non deve generare solo macro corretti; deve generare pasti leggibili, cucinabili, vari e coerenti con le migliori evidenze disponibili.

## 1. Struttura del piatto

Pranzo e cena devono avere una struttura leggibile:

- 1 proteina principale;
- 1 carboidrato principale;
- 1-2 verdure non amidacee;
- 1 grasso/condimento coerente.

Regole negative standard:

- no doppio amido casuale, ad esempio pasta + pane, riso + patate, cous cous + pane, polenta + patate;
- no due proteine principali nello stesso pasto;
- no pesce + latticini nel pasto principale;
- no frutta dolce casuale con proteina animale, ad esempio pollo + banana;
- no ingredienti da colazione in pranzo/cena;
- no ingredienti “soli” senza modalità di consumo.

Piatti unici ammessi se rispettano la struttura: pasta e legumi, riso e lenticchie, insalatona con pane fresco, bowl riso + proteina + verdure, zuppa di legumi + cereale.

## 2. Colazione

La colazione deve contenere una fonte proteica sia nella versione dolce sia nella versione salata.

### Colazione dolce

Proteine ammesse:

- yogurt greco;
- skyr;
- yogurt bianco naturale;
- kefir;
- ricotta;
- fiocchi di latte;
- latte vaccino;
- bevanda di soia ad alto contenuto proteico/non zuccherata;
- yogurt di soia;
- uova/albumi solo in preparazioni coerenti come pancake, crespelle, porridge proteico.

Non ammessi in colazione dolce:

- pollo;
- tacchino;
- prosciutto;
- bresaola;
- pesce;
- salmone affumicato;
- legumi da piatto;
- whey/proteine in polvere per ora.

### Colazione salata

Proteine ammesse:

- uova;
- albumi;
- ricotta;
- fiocchi di latte;
- tofu strapazzato;
- bresaola solo come eccezione occasionale.

Non ammessi:

- pollo;
- prosciutto;
- tacchino affettato/fesa di tacchino affettata;
- salmone affumicato;
- carni processate.

## 3. Snack, pre-workout e post-workout

### Snack normale

Le proteine non sono obbligatorie. Sono utili se passano molte ore dall’ultimo pasto o se il target proteico giornaliero è scoperto.

Snack proteici leggeri:

- yogurt greco;
- skyr;
- ricotta;
- fiocchi di latte;
- latte;
- tofu;
- edamame;
- bresaola occasionale.

Snack carbo/facile digestione:

- banana;
- mela o altra frutta;
- pane fresco con marmellata o miele;
- 2-3 gallette di riso;
- uvetta o datteri per allenamento intenso.

Quando si menziona il pane, DUBI deve preferire la formulazione “pane fresco”.

### Pre-workout

Se l’allenamento è vicino e l’utente ha mangiato proteine nelle 2-3 ore precedenti, lo snack pre-workout deve essere solo carboidrati facili da digerire.

Opzioni:

- banana;
- mela/frutta;
- pane fresco con miele o marmellata;
- gallette di riso;
- datteri/uvetta.

Da evitare vicino all’allenamento:

- carne;
- pesce;
- legumi;
- tofu pesante;
- grassi alti;
- frutta secca abbondante.

### Post-workout

La proteina è obbligatoria. Il post-workout deve abbinare proteine + carboidrati.

Esempi coerenti:

- yogurt greco + frutta;
- latte + banana;
- ricotta + miele;
- panino fresco con proteina ammessa;
- riso + pollo;
- tofu + riso;
- skyr + avena/frutta.

## 4. Pasta

Per una persona sana e attiva, pasta 4-7 pasti/settimana può essere appropriata e adattabile a TDEE, sport e obiettivo.

Tipi da supportare:

- pasta di semola di grano duro;
- pasta integrale;
- pasta di farro;
- pasta di grano saraceno;
- pasta di legumi: lenticchie, ceci, piselli, fagioli.

Schema pasta:

- pasta + verdure + olio EVO;
- pasta + pesce + verdure;
- pasta + pollo/tacchino fresco + verdure;
- pasta + manzo/vitello/maiale magro + verdure, entro limite carne rossa;
- pasta + legumi;
- pasta + tofu/tempeh + verdure;
- pasta + uova + verdure;
- pasta + ricotta;
- pasta + Parmigiano + verdure, con controllo proteico.

Combinazioni escluse dai piani standard:

- panna + pancetta + burro;
- quattro formaggi frequente;
- salsiccia;
- salame;
- grandi quantità di burro.

## 5. Carboidrati

Non servono range settimanali rigidi per ogni carboidrato. Serve rotazione governata.

Regole:

- porzioni calcolate da fabbisogno energetico, attività, obiettivo, pasti e allenamenti;
- preferire cereali integrali o meno raffinati;
- usare almeno 4 fonti carbo diverse in 7 giorni;
- evitare la stessa fonte principale per più di 2 pasti consecutivi;
- un solo amido principale per pasto standard;
- doppio amido solo se TDEE/allenamento/ricetta lo giustifica.

Fonti:

- pasta;
- riso;
- pane fresco;
- patate;
- patate dolci;
- farro;
- orzo;
- quinoa;
- cous cous;
- avena;
- mais;
- polenta.

Classificazione:

- patate, patate dolci, mais e polenta contano come carboidrato, non come verdura libera;
- quinoa è pseudocereale ma nel motore sta nel gruppo `carbohydrate_source`;
- farro e orzo contengono glutine;
- avena per celiaci solo se certificata senza glutine;
- pane può essere fonte principale o accompagnamento, ma deve rientrare nel budget carbo.

## 6. Legumi

Per onnivori:

- legumi come proteina principale: 2-4 pasti/settimana;
- possono arrivare anche a 5-6 in persone sane se dieta varia e compatibile;
- DUBI decide dentro al range in base a TDEE, sport, fibra, obiettivo, preferenze e tolleranza.

Per vegetariani:

- legumi anche quotidiani, alternando con uova, latticini, tofu, tempeh, seitan.

Per vegani:

- legumi/soia/edamame sono alimenti principali, anche quotidiani.

## 7. Pesce

Per onnivori/pescetariani:

- pesce totale: 2-3 pasti/settimana standard;
- può salire a 4-5 se TDEE alto/sport/preferenza;
- pesce grasso o azzurro: almeno 1-2 pasti/settimana;
- varietà specie obbligatoria;
- tonno fresco ammesso ma non base frequente;
- salmone affumicato escluso dai piani standard.

Priorità:

- top: sardine, sgombro, alici/acciughe, aringa, salmone;
- ottimi: trota, branzino, orata, merluzzo, nasello, platessa, sogliola;
- buoni/moderati: tonno fresco, gamberi, calamari, polpo.

Obiettivi:

- massa/alto TDEE: più spazio a salmone, sgombro, sardine, trota;
- dimagrimento/definizione: più pesci magri se serve ridurre calorie, ma mantenere pesce grasso/azzurro per omega-3.

## 8. Carne e processati

Carni ammesse:

- pollo e tacchino freschi senza pelle;
- manzo o vitello magro;
- maiale fresco magro.

Vincoli:

- pollame fresco: 2-3 pasti/settimana;
- carne rossa fresca totale, incluso maiale: 0-2 pasti/settimana;
- nei piani orientati alla prevenzione: preferibilmente 0-1;
- carni processate: 0 pasti/settimana.

Esclusi standard:

- prosciutto cotto/crudo;
- fesa di tacchino affettata;
- speck;
- salame;
- mortadella;
- wurstel;
- salsiccia;
- bacon;
- pancetta;
- carne in scatola;
- nuggets;
- hamburger industriali;
- arrosti confezionati;
- carne impanata/precotta;
- prodotti vegetali ultraprocessati che imitano la carne, da gestire separatamente.

Eccezione:

- bresaola tollerata occasionalmente, massimo 1 volta/settimana, solo contesti colazione salata/snack, non come proteina principale cena.

## 9. Grassi e condimenti

Default pranzo/cena:

- olio extravergine d’oliva.

Grassi contestuali:

- avocado solo in bowl, poke, insalatone, toast;
- frutta secca/semi soprattutto colazione, snack, yogurt, porridge, smoothie, topping, insalate;
- tahina in hummus/piatti mediorientali/legumi;
- creme 100% frutta secca in colazione/snack.

Esclusi standard:

- burro;
- panna;
- margarina;
- grassi idrogenati;
- grassi vegetali raffinati non qualificati.

Regola anti-sovrapposizione:

- evitare troppi grassi nello stesso pasto;
- salmone + olio EVO + verdure ok;
- salmone + avocado + noci + olio EVO no standard.

## 10. Frutta e verdura

Pranzo e cena devono contenere almeno una porzione abbondante di verdure non amidacee.

Target:

- verdure: almeno 3 porzioni/die;
- frutta: 2 porzioni/die;
- colori frutta/verdura: hard rule almeno 3 colori/die; target 4 colori se possibile;
- crucifere: 2-4 volte/settimana;
- verdure a foglia: frequenti;
- piccoli frutti/frutti di bosco: target 1-3 volte/settimana.

Patate, patate dolci, mais, manioca e polenta non contano come verdura libera.

Frutta preferita in:

- colazione;
- snack;
- pre-workout;
- post-workout.

Frutta a pranzo/cena solo se coerente:

- salmone + arancia;
- finocchi + arancia;
- insalata con mela;
- pera + noci + insalata;
- melograno in insalata.

Da evitare:

- pasta + kiwi;
- pollo + banana;
- riso + mela casuale.

## 11. Stagionalità

La stagionalità deve essere filtro prima della generazione.

Flusso:

```txt
data + località → filtro stagionalità → ingredienti ammessi → generazione → validazione finale
```

Default:

- `seasonality_mode = strict`;
- unknown seasonality = non eleggibile;
- fresco fuori stagione disabilitato nel piano standard.

Fallback strict:

1. fresco locale di stagione;
2. fresco nazionale di stagione;
3. surgelato naturale.

Serve distinguere:

- `nutrition_role`: ad esempio patate = carboidrato;
- `seasonality_role`: patate = produce.

## 12. Latticini

Proteine latticine ammesse frequentemente:

- skyr;
- yogurt greco naturale;
- yogurt bianco naturale;
- fiocchi di latte;
- ricotta.

Frequenza:

- 0-2 porzioni/die, in base a fabbisogno proteico/calorico e tolleranza.

Parmigiano:

- ammesso come topping/complemento;
- non fonte proteica principale frequente;
- se non basta per 20-30 g proteine del pasto, aggiungere altra proteina.

Altri formaggi stagionati:

- esclusi dalla generazione standard o occasionali molto rari.

Latte:

- ammesso in colazione, smoothie, overnight oats, pancake, porridge;
- default intero o parzialmente scremato, non scremato obbligatorio.

Bevande vegetali:

- solo senza zuccheri aggiunti;
- priorità: soia, pisello, avena, mandorla;
- riso/cocco bassa priorità.

Light/magro:

- non default;
- usare solo con deficit calorico stretto o richiesta esplicita.

## 13. Meal assembly

Ogni pasto deve avere titolo e istruzione pratica.

Esempi:

- “Porridge con fiocchi d’avena, skyr e banana”;
- “Pasta integrale con salmone e broccoli”;
- “Bowl di riso con tofu e verdure”;
- “Insalatona con uova, pane fresco e avocado”.

Ingredienti che non devono restare soli:

- fiocchi d’avena;
- semi di chia;
- semi di lino;
- miele;
- marmellata;
- cacao;
- cannella;
- gallette;
- riso soffiato;
- latte/bevande vegetali;
- frutta secca/semi.

Devono avere base/contesto:

- avena + latte/yogurt/skyr = porridge/bowl;
- chia + yogurt/latte = pudding/bowl;
- miele + ricotta/yogurt/pane fresco = topping;
- gallette + miele/frutta = snack/pre-workout.

## 14. Audit richiesti

Il JSON del piano deve includere audit leggibili:

- `plateStructureAudit`;
- `mealGrammarAudit`;
- `plantVarietyAudit`;
- `seasonalityAudit`;
- `weeklyRotationAudit`;
- `mealAssemblyAudit`;
- `scienceTrace`.

Gli audit servono a verificare se un piatto è sensato, non solo macro-correct.

## 15. Fonti scientifiche

Le regole sono basate su consensus operativo da:

- CREA – Linee Guida per una Sana Alimentazione;
- SINU – LARN, V Revisione;
- Dietary Guidelines for Americans 2025–2030;
- WHO – Healthy Diet;
- Harvard Healthy Eating Plate;
- ESC – prevenzione cardiovascolare;
- AHA – pesce, omega-3, grassi e carni processate;
- FAO/WHO – pesce, varietà specie e contaminanti;
- WCRF – alimentazione e prevenzione tumori;
- Reynolds et al. 2019, The Lancet;
- Melina, Craig & Levin 2016, Academy of Nutrition and Dietetics;
- Willett et al. 2019, EAT–Lancet;
- Drouin-Chartier et al. 2020, BMJ;
- PREDIMED Trial;
- Gardner et al. 2019, American College of Lifestyle Medicine.
