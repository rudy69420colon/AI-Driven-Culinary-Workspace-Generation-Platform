# AI-Driven Culinary Workspace

An AI-powered recipe discovery and meal planning platform built with vanilla HTML, CSS, and JavaScript.

## Features

- **Standard Recipe Search** - Search thousands of recipes from TheMealDB
- **AI Fridge Chef** - List your ingredients, AI generates a custom recipe via Gemini
- **AI Ingredient Substitutes** - Get 3 smart alternatives for any ingredient
- **AI Nutrition Estimator** - Macro-nutrient calculator for every recipe

## Tech Stack

- **Frontend:** HTML5, CSS3 (glassmorphism, animations), vanilla JS (ES Modules)
- **Recipe Data:** [TheMealDB API](https://www.themealdb.com/)
- **AI Engine:** [Google Gemini API](https://ai.google.dev/) (gemini-2.5-flash-lite)
- **Fonts:** [Google Fonts - Inter](https://fonts.google.com/specimen/Inter)

## Getting Started

1. Clone and serve (ES Modules require HTTP):
   ```
   git clone https://github.com/rudy69420colon/AI-Driven-Culinary-Workspace-Generation-Platform.git
   cd AI-Driven-Culinary-Workspace-Generation-Platform
   npx serve .
   ```

2. Open `http://localhost:3000` in your browser.

## Project Structure

```
index.html      # Main HTML page
style3.css      # Stylesheet (glassmorphism, animations, responsive)
app.js          # UI logic, event handlers, rendering
api.js          # API layer (TheMealDB + Gemini AI with caching and retry)
```

## Configuration

Replace the Gemini API key in `index.html` with your own from [Google AI Studio](https://aistudio.google.com/apikey).
