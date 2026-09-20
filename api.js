const GEMINI_API_KEY = window.ENV?.GEMINI_API_KEY || "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// ─── Simple in-memory cache ───
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ─── TheMealDB: Search recipes by name ───
export async function searchRecipesByName(name) {
    const cacheKey = `search:${name.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(name)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response failed");
        const data = await response.json();
        const meals = data.meals || [];
        setCache(cacheKey, meals);
        return meals;
    } catch (error) {
        console.error("Failed fetching recipes:", error);
        throw new Error("Could not fetch recipes. Please check your internet connection.");
    }
}

// ─── TheMealDB: Get recipe details by ID ───
export async function getRecipeDetailsById(id) {
    const cacheKey = `detail:${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response failed");
        const data = await response.json();
        const meal = data.meals ? data.meals[0] : null;
        if (meal) setCache(cacheKey, meal);
        return meal;
    } catch (error) {
        console.error(`Failed fetching details for ID ${id}:`, error);
        throw new Error("Could not load recipe details.");
    }
}

// ─── TheMealDB: Random meals for featured section ───
export async function getRandomMeals(count = 6) {
    try {
        const promises = Array.from({ length: count }, () =>
            fetch('https://www.themealdb.com/api/json/v1/1/random.php')
                .then(r => r.json())
                .then(d => d.meals?.[0])
        );
        const meals = await Promise.all(promises);
        return meals.filter(Boolean);
    } catch (error) {
        console.error("Failed fetching random meals:", error);
        return [];
    }
}

// ─── JSON Parser with fallback ───
function extractAndParseJson(rawText) {
    try {
        return JSON.parse(rawText.trim());
    } catch (parseError) {
        const startIdx = rawText.search(/[{[]/);
        const endIdx = Math.max(rawText.lastIndexOf('}'), rawText.lastIndexOf(']'));
        if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) throw parseError;
        return JSON.parse(rawText.substring(startIdx, endIdx + 1));
    }
}

// ─── Gemini API call with retry ───
async function callGemini(prompt, responseSchema = null, retries = 2) {
    if (!GEMINI_API_KEY) {
        throw new Error("Missing Gemini API Key. Please configure it in the HTML setup.");
    }

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    if (responseSchema) {
        payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const msg = errorData.error?.message || "AI request failed.";
                if (attempt < retries && response.status >= 500) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                throw new Error(msg);
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (err) {
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
}

// ─── AI: Generate recipe from fridge ingredients ───
export async function generateFridgeRecipe(ingredientsString) {
    const prompt = `Based strictly on these available ingredients: "${ingredientsString}", generate a recipe.`;
    const schema = {
        type: "OBJECT",
        properties: {
            idMeal: { type: "STRING" },
            strMeal: { type: "STRING" },
            strCategory: { type: "STRING" },
            strMealThumb: { type: "STRING" },
            ingredients: { type: "ARRAY", items: { type: "STRING" } },
            instructions: { type: "STRING" }
        },
        required: ["idMeal", "strMeal", "strCategory", "strMealThumb", "ingredients", "instructions"]
    };

    const rawText = await callGemini(prompt, schema);
    const parsed = extractAndParseJson(rawText);
    if (parsed.idMeal !== "ai_generated") parsed.idMeal = "ai_generated";
    if (!parsed.strMealThumb) {
        parsed.strMealThumb = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&auto=format&fit=crop";
    }
    return parsed;
}

// ─── AI: Get ingredient substitutes ───
export async function getIngredientSubstitute(ingredientName) {
    const prompt = `Give me exactly 3 common kitchen alternatives or substitutes for "${ingredientName}".`;
    const schema = {
        type: "ARRAY",
        items: { type: "STRING" }
    };
    const rawText = await callGemini(prompt, schema);
    return extractAndParseJson(rawText);
}

// ─── AI: Estimate nutrition ───
export async function estimateNutrition(ingredientsArray) {
    const prompt = `Estimate individual nutritional macro values for a single serving size item containing these ingredients: ${JSON.stringify(ingredientsArray)}.`;
    const schema = {
        type: "OBJECT",
        properties: {
            calories: { type: "INTEGER" },
            protein: { type: "STRING" },
            carbs: { type: "STRING" },
            fats: { type: "STRING" }
        },
        required: ["calories", "protein", "carbs", "fats"]
    };
    const rawText = await callGemini(prompt, schema);
    return extractAndParseJson(rawText);
}