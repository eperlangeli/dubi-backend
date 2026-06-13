# DUBI Task 8/9 Readiness Checklist

Spuntare questi 10 punti prima di considerare chiusi legal integration e DB RLS production mode.

- [ ] `dubi_legal.js` e servito dal frontend e caricato prima dello script React/Babel.
- [ ] `getLegal(section)` e `getLegalConsent(section)` leggono `dubi_lang` e fanno fallback IT/EN.
- [ ] Onboarding: checkbox obbligatoria Termini + Privacy prima della generazione del piano.
- [ ] Onboarding: consenso Art. 9 GDPR visibile prima dei form obiettivi/allergie e ribadito prima del piano.
- [ ] Wearable: consenso contestuale presente sia in onboarding sia in Impostazioni prima del redirect OAuth.
- [ ] Impostazioni: sezione Privacy e Termini apre Privacy Policy, Terms of Service e Health Disclaimer.
- [ ] Modal legal: centrato, scroll interno, nessuna sovrapposizione con home/bottom nav.
- [ ] Supabase: eseguito `sql/create-dubi-app-role.sql` e creata password sicura per `dubi_app`.
- [ ] Render: `DATABASE_URL` usa `dubi_app` e le query di verifica RLS passano senza `rolbypassrls`.
- [ ] Smoke test completo: signup nuovo utente, consenso legal, onboarding, generazione piano, impostazioni legal, wearable OAuth click.
