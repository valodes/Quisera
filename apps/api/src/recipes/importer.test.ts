// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  parse750gSearchHtml,
  parseCuisineAzSearchHtml,
  parseHerveCuisineSearchHtml,
  parseJowSitemapXml,
  parseMarmitonSearchHtml,
} from './catalog-search.js'
import { parseQuitoqueNutrition, parseQuitoqueServings } from '../quitoque/nutrition.js'
import {
  extractNutrition,
  extractSchemaOrgRecipe,
  parseFrenchIngredient,
  parseIsoDurationMinutes,
  parseServings,
  validateExternalRecipeUrl,
} from './importer.js'

describe('recipe importer', () => {
  it('parses ISO-8601 durations into minutes', () => {
    expect(parseIsoDurationMinutes('PT30M')).toBe(30)
    expect(parseIsoDurationMinutes('PT1H15M')).toBe(75)
    expect(parseIsoDurationMinutes('PT45S')).toBe(1)
    expect(parseIsoDurationMinutes('25 min')).toBe(25)
    expect(parseIsoDurationMinutes('invalid')).toBeNull()
  })

  it('parses French ingredient lines cleanly', () => {
    expect(parseFrenchIngredient('200 g de farine')).toEqual({
      name: 'farine',
      quantity: '200',
      unit: 'g',
      notes: null,
    })
    expect(parseFrenchIngredient("2 gousses d'ail (hachées)")).toEqual({
      name: 'ail',
      quantity: '2',
      unit: 'gousses',
      notes: 'hachées',
    })
    expect(parseFrenchIngredient('½ citron')).toEqual({
      name: 'citron',
      quantity: '0.5',
      unit: null,
      notes: null,
    })
    expect(parseFrenchIngredient("3 c. à s. d'huile d'olive")).toEqual({
      name: "huile d'olive",
      quantity: '3',
      unit: 'c. à s.',
      notes: null,
    })
    expect(parseFrenchIngredient('1 1/2 c. à soupe de miel &rsquo;bio&rsquo;')).toEqual({
      name: 'miel ’bio’',
      quantity: '1.5',
      unit: 'c. à soupe',
      notes: null,
    })
    expect(parseFrenchIngredient('2 à 3 tomates')).toEqual({
      name: 'tomates',
      quantity: '2-3',
      unit: null,
      notes: null,
    })
  })

  it('extracts schema.org/Recipe from @graph JSON-LD with HowToSection and calories', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "WebPage", "name": "Ignored" },
              {
                "@type": "Recipe",
                "name": "Quiche Lorraine",
                "description": "Un grand classique.",
                "image": { "@type": "ImageObject", "url": "https://example.com/quiche.jpg" },
                "prepTime": "PT15M",
                "cookTime": "PT35M",
                "recipeCategory": ["Plat principal"],
                "recipeYield": "4 personnes",
                "keywords": "tarte, lardons, rapide",
                "nutrition": {
                  "@type": "NutritionInformation",
                  "calories": "620 kcal",
                  "proteinContent": "24 g",
                  "carbohydrateContent": "42 g",
                  "fatContent": "38 g",
                  "fiberContent": "3.5 g",
                  "sodiumContent": "800 mg"
                },
                "recipeIngredient": ["1 pâte brisée", "200 g de lardons", "3 œufs"],
                "recipeInstructions": [
                  {
                    "@type": "HowToSection",
                    "itemListElement": [
                      { "@type": "HowToStep", "text": "Préchauffer le four à 180°C." },
                      { "@type": "HowToStep", "text": "Cuire 35 minutes." }
                    ]
                  }
                ]
              }
            ]
          }
        </script>
      </head></html>
    `
    const draft = extractSchemaOrgRecipe(html, 'https://jow.fr/recipes/quiche-lorraine')
    expect(draft).not.toBeNull()
    expect(draft?.title).toBe('Quiche Lorraine')
    expect(draft?.totalMinutes).toBe(50)
    expect(draft?.servings).toBe(4)
    expect(draft?.caloriesKcal).toBe(620)
    expect(draft?.nutrition).toEqual({
      caloriesKcal: 620,
      proteinGrams: 24,
      carbsGrams: 42,
      fatGrams: 38,
      fiberGrams: 3.5,
      sugarGrams: null,
      saltGrams: 2,
    })
    expect(draft?.imageUrl).toBe('https://example.com/quiche.jpg')
    expect(draft?.category).toBe('Plat principal')
    expect(draft?.tags).toEqual(['tarte', 'lardons', 'rapide'])
    expect(draft?.ingredients).toHaveLength(3)
    expect(draft?.steps).toEqual(['Préchauffer le four à 180°C.', 'Cuire 35 minutes.'])
  })

  it('blocks private/local URLs and non-HTTP schemes', () => {
    expect(() => validateExternalRecipeUrl('http://localhost:3000/api')).toThrow()
    expect(() => validateExternalRecipeUrl('http://127.0.0.1/secret')).toThrow()
    expect(() => validateExternalRecipeUrl('http://[::ffff:127.0.0.1]/secret')).toThrow()
    expect(() => validateExternalRecipeUrl('http://[fe80::1]/secret')).toThrow()
    expect(() => validateExternalRecipeUrl('http://192.168.1.10/admin')).toThrow()
    expect(() => validateExternalRecipeUrl('file:///etc/passwd')).toThrow()
    expect(validateExternalRecipeUrl('https://www.marmiton.org/recettes/x.aspx').hostname).toBe(
      'www.marmiton.org',
    )
  })

  it('parses catalog search results with images for Jow, Marmiton, 750g, CuisineAZ and Hervé Cuisine', () => {
    const jowXml = `
      <urlset>
        <url>
          <loc>https://jow.fr/recipes/lasagnes-vege-7vgj14mfb7kw03qm0u73</loc>
          <video:video>
            <video:thumbnail_loc>https://static.jow.fr/recipes/J0OOIxfN7eNuYw.png</video:thumbnail_loc>
            <video:title>Lasagnes végé aux courgettes</video:title>
            <video:description>Délicieuses lasagnes.</video:description>
          </video:video>
        </url>
      </urlset>
    `
    expect(parseJowSitemapXml(jowXml)).toMatchObject([
      {
        source: 'jow',
        sourceLabel: 'Jow',
        title: 'Lasagnes végé aux courgettes',
        url: 'https://jow.fr/recipes/lasagnes-vege-7vgj14mfb7kw03qm0u73',
        imageUrl: 'https://static.jow.fr/recipes/J0OOIxfN7eNuYw.png',
      },
    ])

    const marmitonHtml = `
      <script type="application/ld+json">
        {"@type":"ItemList","itemListElement":[{"url":"https://www.marmiton.org/recettes/recette_poulet-curry_80990.aspx","name":"Poulet au curry","image":"https://assets.afcdn.com/recipe/1.webp"}]}
      </script>
    `
    expect(parseMarmitonSearchHtml(marmitonHtml, 5)).toEqual([
      {
        source: 'marmiton',
        sourceLabel: 'Marmiton',
        title: 'Poulet au curry',
        url: 'https://www.marmiton.org/recettes/recette_poulet-curry_80990.aspx',
        imageUrl: 'https://assets.afcdn.com/recipe/1.webp',
      },
    ])

    const g750Html = `
      <figure><picture><img class="thumb-img" src="https://static.750g.com/images/145-110/abc/poulet.jpg" alt="Poulet rôti" /></picture></figure>
      <div class="news-card-info"><a href="https://www.750g.com/poulet-roti-r41818.htm" class="news-card-link">Poulet rôti</a></div>
    `
    expect(parse750gSearchHtml(g750Html, 5)).toEqual([
      {
        source: '750g',
        sourceLabel: '750g',
        title: 'Poulet rôti',
        url: 'https://www.750g.com/poulet-roti-r41818.htm',
        imageUrl: 'https://static.750g.com/images/640-420/abc/poulet.jpg',
      },
    ])

    const cazHtml = `
      <nav><a href="/recettes/crepe-facile-78347.aspx">Crêpes faciles</a></nav>
      <article id="result" class="tile searchResult">
        <div class="tile_thumbnail"><img src="https://img.cuisineaz.com/312x250/poulet.jpeg" /></div>
        <h2 class="search_tile_title"><a href="/recettes/poulet-basquaise-12345.aspx">Recette : Poulet basquaise</a></h2>
      </article>
    `
    expect(parseCuisineAzSearchHtml(cazHtml, 5)).toEqual([
      {
        source: 'cuisineaz',
        sourceLabel: 'CuisineAZ',
        title: 'Poulet basquaise',
        url: 'https://www.cuisineaz.com/recettes/poulet-basquaise-12345.aspx',
        imageUrl: 'https://img.cuisineaz.com/312x250/poulet.jpeg',
      },
    ])

    const herveHtml = `<a href="https://www.hervecuisine.com/recette/poulet-tikka/"><img src="https://www.hervecuisine.com/img.jpg" alt="Poulet tikka" />Poulet tikka</a>`
    expect(parseHerveCuisineSearchHtml(herveHtml, 5)[0]).toMatchObject({
      url: 'https://www.hervecuisine.com/recette/poulet-tikka/',
      imageUrl: 'https://www.hervecuisine.com/img.jpg',
    })
  })

  it('parses servings and Quitoque nutritional payloads', () => {
    expect(parseServings('Pour 4 personnes')).toBe(4)
    expect(parseServings(['6 servings'])).toBe(6)
    expect(extractNutrition({ calories: '540 kcal', proteinContent: '28g' })).toEqual({
      caloriesKcal: 540,
      proteinGrams: 28,
      carbsGrams: null,
      fatGrams: null,
      fiberGrams: null,
      sugarGrams: null,
      saltGrams: null,
    })

    const quitoqueProduct = {
      default_variant_size: '2',
      nutritional_values: JSON.stringify({
        per_serving: {
          energy_kcal: 685,
          proteins: 31.4,
          carbohydrates: 72,
          fats: 26.5,
          fibers: 6.2,
          sugars: 9.1,
          salt: 1.8,
        },
      }),
    }
    expect(parseQuitoqueServings(quitoqueProduct)).toBe(2)
    expect(parseQuitoqueNutrition(quitoqueProduct)).toEqual({
      caloriesKcal: 685,
      proteinGrams: 31.4,
      carbsGrams: 72,
      fatGrams: 26.5,
      fiberGrams: 6.2,
      sugarGrams: 9.1,
      saltGrams: 1.8,
    })
  })
})
