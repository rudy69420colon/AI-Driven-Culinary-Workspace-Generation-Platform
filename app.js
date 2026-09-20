import {
    searchRecipesByName,
    getRecipeDetailsById,
    getRandomMeals,
    generateFridgeRecipe,
    getIngredientSubstitute,
    estimateNutrition
} from './api.js';

// ─── DOM References ───
const mainCanvas = document.getElementById('main-canvas');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('trigger-search-btn');
const searchPanel = document.getElementById('search-control-panel');
const modeButtons = document.querySelectorAll('.mode-btn');
const modalWrapper = document.getElementById('detail-modal-wrapper');
const modalContentRoot = document.getElementById('modal-content-root');
const modalHeroSlot = document.getElementById('modal-hero-slot');
const closeModalTrigger = document.getElementById('close-modal-trigger');
const toastContainer = document.getElementById('toast-container');
const recentSearchesBar = document.getElementById('recent-searches-bar');

let currentMode = 'standard';
let activeAiMeal = null;
let debounceTimer = null;

// ─── Toast Notification System ───
function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'error' ? '⚠️' : '✅';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
}

// ─── Recent Searches ───
function getRecentSearches() {
    try {
        return JSON.parse(localStorage.getItem('recentSearches') || '[]');
    } catch { return []; }
}

function addRecentSearch(query) {
    let searches = getRecentSearches();
    searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase());
    searches.unshift(query);
    searches = searches.slice(0, 6);
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    renderRecentSearches();
}

function renderRecentSearches() {
    const searches = getRecentSearches();
    if (searches.length === 0) {
        recentSearchesBar.innerHTML = '';
        return;
    }
    recentSearchesBar.innerHTML = searches.map(s =>
        `<button class="recent-chip" data-query="${s.replace(/"/g, '&quot;')}">${s}</button>`
    ).join('');
}

recentSearchesBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.recent-chip');
    if (!chip) return;
    searchInput.value = chip.dataset.query;
    executionPipeline();
});

// ─── Mode Switching ───
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;

        searchInput.value = '';

        if (currentMode === 'ai') {
            searchPanel.classList.add('ai-active');
            searchInput.placeholder = "List what's in your fridge (e.g., eggs, rice, onion)...";
        } else {
            searchPanel.classList.remove('ai-active');
            searchInput.placeholder = "Search for recipes (e.g., chicken, pasta, cake)...";
        }
        showEmptyState();
    });
});

// ─── Skeleton Loader ───
function showSkeletons(count = 6) {
    mainCanvas.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        skeleton.innerHTML = `
            <div class="skeleton-img"></div>
            <div class="skeleton-content">
                <div class="skeleton-line short"></div>
                <div class="skeleton-line medium"></div>
            </div>
        `;
        skeleton.style.animationDelay = `${i * 80}ms`;
        mainCanvas.appendChild(skeleton);
    }
}

// ─── Empty State ───
function showEmptyState() {
    if (currentMode === 'standard') {
        mainCanvas.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">🍽️</span>
                <h3>What are you craving?</h3>
                <p>Search for any recipe or explore popular categories below</p>
                <div class="quick-tags">
                    <button class="quick-tag" data-query="chicken">🍗 Chicken</button>
                    <button class="quick-tag" data-query="pasta">🍝 Pasta</button>
                    <button class="quick-tag" data-query="cake">🎂 Desserts</button>
                    <button class="quick-tag" data-query="breakfast">🥞 Breakfast</button>
                    <button class="quick-tag" data-query="soup">🍲 Soups</button>
                    <button class="quick-tag" data-query="salmon">🐟 Seafood</button>
                </div>
            </div>
        `;
    } else {
        mainCanvas.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">🧊</span>
                <h3>What's in your fridge?</h3>
                <p>List your ingredients and AI will create a custom recipe just for you</p>
                <div class="quick-tags">
                    <button class="quick-tag" data-query="eggs, cheese, bread">🥚 Eggs, Cheese, Bread</button>
                    <button class="quick-tag" data-query="rice, chicken, soy sauce">🍚 Rice, Chicken, Soy</button>
                    <button class="quick-tag" data-query="pasta, tomato, garlic, basil">🍅 Pasta, Tomato, Basil</button>
                </div>
            </div>
        `;
    }
}

// Quick tag clicks
mainCanvas.addEventListener('click', (e) => {
    const quickTag = e.target.closest('.quick-tag');
    if (quickTag) {
        searchInput.value = quickTag.dataset.query;
        executionPipeline();
        return;
    }
});

// ─── Card Rendering ───
function renderRecipeCards(meals, isAi = false) {
    mainCanvas.innerHTML = '';

    if (!meals || (Array.isArray(meals) && meals.length === 0)) {
        mainCanvas.innerHTML = `<p class="no-results">No meals found. Try another search!</p>`;
        return;
    }

    const mealsArray = Array.isArray(meals) ? meals : [meals];

    mealsArray.forEach((meal, index) => {
        const card = document.createElement('div');
        card.className = `recipe-card ${isAi ? 'ai-card' : ''}`;
        card.dataset.id = meal.idMeal;
        card.style.animationDelay = `${index * 80}ms`;
        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${meal.strMealThumb}" alt="${meal.strMeal}" loading="lazy">
            </div>
            <div class="card-content">
                <div class="card-category">${meal.strCategory || 'Custom'}</div>
                <div class="card-title">${meal.strMeal}</div>
            </div>
        `;
        mainCanvas.appendChild(card);
    });
}

// ─── Search Pipeline ───
async function executionPipeline() {
    const query = searchInput.value.trim();
    if (!query) return;

    showSkeletons(currentMode === 'ai' ? 1 : 6);

    try {
        if (currentMode === 'standard') {
            addRecentSearch(query);
            const meals = await searchRecipesByName(query);
            renderRecipeCards(meals, false);
        } else {
            const aiMeal = await generateFridgeRecipe(query);
            activeAiMeal = aiMeal;
            renderRecipeCards(aiMeal, true);
            showToast('AI recipe generated successfully!', 'success');
        }
    } catch (err) {
        console.error("Pipeline fault:", err);
        mainCanvas.innerHTML = '';
        showToast(err.message || 'Something went wrong. Please try again.', 'error');
        showEmptyState();
    }
}

searchBtn.addEventListener('click', executionPipeline);
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executionPipeline();
});

// ─── Debounced input for standard mode (optional live search hint) ───
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    // Could enable live search here with: debounceTimer = setTimeout(executionPipeline, 500);
});

// ─── Modal: Open Recipe Details ───
mainCanvas.addEventListener('click', async (e) => {
    const card = e.target.closest('.recipe-card');
    if (!card) return;

    const id = card.dataset.id;
    modalWrapper.style.display = 'flex';
    modalHeroSlot.innerHTML = '';
    modalContentRoot.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';

    let mealData = null;
    let ingredientsList = [];

    try {
        if (id === 'ai_generated') {
            mealData = activeAiMeal;
            ingredientsList = mealData?.ingredients || [];
        } else {
            const rawMeal = await getRecipeDetailsById(id);
            if (!rawMeal) throw new Error("Recipe details not found.");
            mealData = rawMeal;

            for (let i = 1; i <= 20; i++) {
                const ing = rawMeal[`strIngredient${i}`];
                const measure = rawMeal[`strMeasure${i}`];
                if (ing && ing.trim() !== "") {
                    ingredientsList.push(`${measure ? measure.trim() : ''} ${ing.trim()}`);
                }
            }
        }

        if (!mealData) return;

        // Render hero image
        if (mealData.strMealThumb) {
            modalHeroSlot.innerHTML = `
                <div class="modal-hero">
                    <img src="${mealData.strMealThumb}" alt="${mealData.strMeal}">
                </div>
            `;
        }

        modalContentRoot.innerHTML = `
            <div class="modal-header-block">
                <h2 class="modal-title">${mealData.strMeal}</h2>
                <span class="modal-meta-tag">${mealData.strCategory || 'General'}</span>
            </div>
            <div class="modal-split-layout">
                <div class="ingredients-section">
                    <h3>Ingredients</h3>
                    <div id="ingredients-target-box">
                        ${ingredientsList.map(item => {
                            const sanitizedItem = item.replace(/"/g, '&quot;');
                            return `
                                <div class="ingredient-item">
                                    <div class="ingredient-text-wrapper">
                                        <span>🔹 ${item}</span>
                                        <button class="ai-sub-trigger" data-ingredient="${sanitizedItem}">AI Sub 🔄</button>
                                    </div>
                                    <div class="substitutes-display" style="display:none;"></div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="instructions-section">
                        <h3>Instructions</h3>
                        <p>${mealData.strInstructions || mealData.instructions || 'No instructions provided.'}</p>
                    </div>
                    <div class="ai-nutrition-panel">
                        <div class="nutrition-header">⚡ AI Nutrition Estimate</div>
                        <div class="nutrition-grid" id="nutrition-target-grid">
                            <div class="macro-box"><div class="macro-label">Calories</div><div class="macro-val">...</div></div>
                            <div class="macro-box"><div class="macro-label">Protein</div><div class="macro-val">...</div></div>
                            <div class="macro-box"><div class="macro-label">Carbs</div><div class="macro-val">...</div></div>
                            <div class="macro-box"><div class="macro-label">Fats</div><div class="macro-val">...</div></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (ingredientsList.length > 0) {
            triggerNutritionPipeline(ingredientsList);
        }
    } catch (err) {
        console.error("Modal error:", err);
        modalHeroSlot.innerHTML = '';
        modalContentRoot.innerHTML = `<p class="error-msg" style="padding:2rem;">Failed to load recipe details.</p>`;
        showToast(err.message || 'Could not load recipe.', 'error');
    }
});

// ─── AI Ingredient Substitutes ───
modalContentRoot.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('ai-sub-trigger')) return;

    const triggerBtn = e.target;
    const itemQuery = triggerBtn.dataset.ingredient;
    const itemContainer = triggerBtn.closest('.ingredient-item');
    const responseDisplay = itemContainer.querySelector('.substitutes-display');

    triggerBtn.innerText = "Finding...";
    triggerBtn.disabled = true;
    triggerBtn.style.opacity = '1';

    try {
        const alts = await getIngredientSubstitute(itemQuery);
        responseDisplay.innerHTML = `💡 ${alts && alts.length ? alts.join(' · ') : 'No substitutes found'}`;
        responseDisplay.style.display = 'block';
    } catch (err) {
        responseDisplay.innerHTML = "Could not find substitutes.";
        responseDisplay.style.display = 'block';
        showToast('Substitute lookup failed.', 'error');
    } finally {
        triggerBtn.style.display = 'none';
    }
});

// ─── Nutrition Pipeline ───
async function triggerNutritionPipeline(ingredientsList) {
    const grid = document.getElementById('nutrition-target-grid');
    if (!grid) return;

    try {
        const macros = await estimateNutrition(ingredientsList);
        grid.innerHTML = `
            <div class="macro-box"><div class="macro-label">Calories</div><div class="macro-val">${macros.calories || '-'} kcal</div></div>
            <div class="macro-box"><div class="macro-label">Protein</div><div class="macro-val">${macros.protein || '-'}</div></div>
            <div class="macro-box"><div class="macro-label">Carbs</div><div class="macro-val">${macros.carbs || '-'}</div></div>
            <div class="macro-box"><div class="macro-label">Fats</div><div class="macro-val">${macros.fats || '-'}</div></div>
        `;
    } catch (err) {
        grid.innerHTML = `<p style="grid-column:1/-1; font-size:0.8rem; color:var(--text-muted); text-align:center; padding:0.5rem;">Could not estimate nutrition.</p>`;
    }
}

// ─── Modal Close ───
closeModalTrigger.addEventListener('click', () => { modalWrapper.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target === modalWrapper) modalWrapper.style.display = 'none'; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalWrapper.style.display = 'none'; });

// ─── Init: Show empty state + recent searches ───
showEmptyState();
renderRecentSearches();