'use strict';

// Central science/source registry used by DUBI meal-engine configs and UI source sections.
// Keep this list factual and source-oriented; product copy should paraphrase it.

const SCIENCE_SOURCES = Object.freeze({
  crea_guidelines: Object.freeze({
    title: 'CREA – Linee Guida per una Sana Alimentazione',
    url: 'https://www.crea.gov.it/web/alimenti-e-nutrizione/-/linee-guida-per-una-sana-alimentazione-2018',
    themes: Object.freeze(['mediterranean_diet', 'food_variety', 'legumes', 'fish', 'fruit_vegetables', 'olive_oil'])
  }),
  sinu_larn_v: Object.freeze({
    title: 'SINU – LARN, V Revisione',
    url: 'https://sinu.it/',
    themes: Object.freeze(['nutrient_reference_intakes', 'portion_standards', 'protein_variety', 'dairy', 'unsaturated_fats'])
  }),
  dietary_guidelines_2025_2030: Object.freeze({
    title: 'Dietary Guidelines for Americans 2025–2030 – USDA/HHS',
    url: 'https://www.dietaryguidelines.gov/',
    themes: Object.freeze(['dietary_patterns', 'whole_grains', 'dairy', 'soy_beverages', 'food_variety'])
  }),
  who_healthy_diet: Object.freeze({
    title: 'World Health Organization – Healthy Diet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
    themes: Object.freeze(['fruit_vegetables', 'whole_grains', 'legumes', 'limit_processed_foods'])
  }),
  harvard_healthy_eating_plate: Object.freeze({
    title: 'Harvard T.H. Chan School of Public Health – Healthy Eating Plate',
    url: 'https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/',
    themes: Object.freeze(['plate_model', 'whole_grains', 'healthy_proteins', 'healthy_fats', 'plant_variety'])
  }),
  esc_prevention_guidelines: Object.freeze({
    title: 'European Society of Cardiology – Cardiovascular Prevention Guidelines',
    url: 'https://www.escardio.org/Guidelines',
    themes: Object.freeze(['cardiovascular_prevention', 'mediterranean_diet', 'fish', 'legumes', 'unsaturated_fats'])
  }),
  aha_fish_and_fats: Object.freeze({
    title: 'American Heart Association – Fish, Omega-3 and Dietary Fats Guidance',
    url: 'https://www.heart.org/',
    themes: Object.freeze(['fish', 'omega_3', 'unsaturated_fats', 'minimize_processed_meat'])
  }),
  fao_who_fish: Object.freeze({
    title: 'FAO/WHO – Fish nutrition, species variety and contaminants',
    url: 'https://www.fao.org/',
    themes: Object.freeze(['fish', 'species_variety', 'omega_3', 'contaminants'])
  }),
  wcrf_cancer_prevention: Object.freeze({
    title: 'World Cancer Research Fund – Diet, Nutrition, Physical Activity and Cancer Prevention',
    url: 'https://www.wcrf.org/',
    themes: Object.freeze(['plant_foods', 'processed_meat', 'red_meat', 'cancer_prevention'])
  }),
  reynolds_2019_lancet: Object.freeze({
    title: 'Reynolds A. et al. (2019) – Carbohydrate quality and human health, The Lancet',
    url: 'https://pubmed.ncbi.nlm.nih.gov/30638909/',
    themes: Object.freeze(['fiber', 'whole_grains', 'legumes', 'carbohydrate_quality'])
  }),
  melina_2016_vegetarian_diets: Object.freeze({
    title: 'Melina V., Craig W., Levin S. (2016) – Position of the Academy of Nutrition and Dietetics: Vegetarian Diets',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27886704/',
    themes: Object.freeze(['vegetarian_diets', 'vegan_diets', 'b12', 'diet_planning'])
  }),
  eat_lancet_2019: Object.freeze({
    title: 'Willett W. et al. (2019) – EAT–Lancet Commission on healthy diets from sustainable food systems',
    url: 'https://pubmed.ncbi.nlm.nih.gov/30660336/',
    themes: Object.freeze(['plant_forward', 'legumes', 'whole_grains', 'nuts', 'moderate_animal_foods'])
  }),
  drouin_chartier_2020_bmj: Object.freeze({
    title: 'Drouin-Chartier J.P. et al. (2020) – Egg consumption and cardiovascular disease, BMJ',
    url: 'https://www.bmj.com/content/368/bmj.m513',
    themes: Object.freeze(['eggs', 'cardiovascular_risk', 'moderate_consumption'])
  }),
  predimed_trial: Object.freeze({
    title: 'PREDIMED Trial – Mediterranean diet enriched with extra-virgin olive oil or nuts',
    url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa1200303',
    themes: Object.freeze(['mediterranean_diet', 'extra_virgin_olive_oil', 'nuts', 'cardiovascular_prevention'])
  }),
  gardner_2019_aclm: Object.freeze({
    title: 'Gardner C.D. et al. (2019) – American College of Lifestyle Medicine consensus on dietary patterns',
    url: 'https://academic.oup.com/advances/article/10/4/559/5476413',
    themes: Object.freeze(['minimally_processed_foods', 'plant_predominant', 'diet_quality'])
  })
});

module.exports = {
  SCIENCE_SOURCES
};
