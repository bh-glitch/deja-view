# Demo plan (draft, not validated)

Host: Bhavya's laptop, one backend, one SQLite database (`PROTOTYPE_MODE=live`,
`DATABASE_PATH=../data/app.db`). Consenting teammates, demo names, fictional
conversation content only. Present it as a prototype.

1. `uv run --project backend --locked python scripts/prepare-models.py --verify`
2. Start the backend (single worker, no reload) and `npm run build && npm run start`.
3. Enable the camera → enroll a teammate (introduction → confirm) → walk away/return.
4. Record a short conversation → review → save → return → **Who is this?**
5. Show unknown, multiple-face, and restart persistence behavior.

Notes to disclose: buffalo_l weights are non-commercial research only; audio goes to
ElevenLabs and text to Gemini only when those buttons are used.
