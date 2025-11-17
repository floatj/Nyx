# AI Text RPG

A prompt-driven, LLM-generated text RPG with streaming narration and interactive choices. Built with Svelte, TailwindCSS, Node.js, and OpenRouter.

## Features

✨ **3 Game Modes**
- 🏰 **Dungeon Crawl**: Explore dark catacombs filled with monsters, traps, and treasure
- ⚔️ **Hero's Journey**: Epic quest with companions and moral choices
- 🔍 **Mystery Night**: Solve noir crimes with clues and time pressure

🎮 **Core Gameplay**
- Real-time streaming narration with cursor animation
- 2-4 interactive choices per turn
- Token budget tracking with visual meter
- Anonymous sessions with 7-day expiry
- Complete state machine preventing UI race conditions

💾 **Save/Load System**
- Up to 5 save slots per browser
- Export saves as JSON files
- Import saves from other sessions
- Auto-save metadata (mode, turns, tokens)

🧪 **Quality Assurance**
- Comprehensive unit tests (Vitest)
- State machine validation
- Error recovery with retry capability
- History management prevents context overflow

## Tech Stack

**Frontend:**
- Svelte 5 + TypeScript
- TailwindCSS (with typography and forms plugins)
- Vite (build tool)
- Vitest (testing)

**Backend:**
- Node.js + Express + TypeScript
- OpenRouter API (model-agnostic LLM)
- Pino (structured logging)
- Server-Sent Events (SSE streaming)

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- OpenRouter API key ([get one here](https://openrouter.ai/))

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd Nyx

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

**Backend Configuration:**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
TOKEN_BUDGET_PER_SESSION=20000
```

**Frontend Configuration:**

```bash
cd ../frontend
cp .env.example .env
```

The default `VITE_API_URL=http://localhost:3000` should work for local development.

### 3. Run Development Servers

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

Backend will start on http://localhost:3000

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

Frontend will start on http://localhost:5173

### 4. Play the Game!

1. Open http://localhost:5173 in your browser
2. Choose a game mode (Dungeon, Journey, or Mystery)
3. Watch the streaming narration appear
4. Click choices to advance the story
5. Save your progress anytime with the Save button

## Testing

### Frontend Tests

```bash
cd frontend

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Backend Tests

```bash
cd backend

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Test Coverage

The project includes comprehensive tests for:

**Frontend:**
- ✅ gameStore (state machine, transitions, events)
- ✅ Component rendering and interactions
- ✅ Save/load functionality

**Backend:**
- ✅ promptService (template generation, JSON parsing)
- ✅ historyManager (sliding window, token estimation)
- ✅ Session management
- ✅ API endpoints

## Project Structure

```
Nyx/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Express server
│   │   ├── types/index.ts           # TypeScript types
│   │   ├── routes/
│   │   │   ├── session.ts           # Session management API
│   │   │   └── play.ts              # Game turn API (SSE streaming)
│   │   └── services/
│   │       ├── openRouterClient.ts  # LLM client
│   │       ├── sessionManager.ts    # Session tracking
│   │       ├── historyManager.ts    # Context management
│   │       ├── promptService.ts     # Prompt templates
│   │       └── __tests__/           # Unit tests
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.svelte               # Root component
│   │   ├── app.css                  # Tailwind + custom styles
│   │   ├── stores/
│   │   │   └── gameStore.ts         # State machine
│   │   ├── components/
│   │   │   ├── StoryPane.svelte     # Narration display
│   │   │   ├── ChoiceList.svelte    # Interactive choices
│   │   │   ├── TokenMeter.svelte    # Budget tracker
│   │   │   └── SaveSlotModal.svelte # Save/load UI
│   │   ├── pages/
│   │   │   └── Play.svelte          # Main game page
│   │   ├── services/
│   │   │   ├── api.ts               # Backend API client
│   │   │   └── storage.ts           # localStorage manager
│   │   └── test/
│   │       └── setup.ts             # Test configuration
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env.example
│
└── Documentation/
    ├── ai_text_rpg_phase1_mvp_plan.md
    ├── ai_text_rpg_phase1.5_implementation_details.md
    └── ai_text_rpg_phase2_enhancements.md
```

## Architecture Highlights

### State Machine (Phase 1.5)

The game uses a formal state machine with 9 states and validated transitions:

```
uninitialized → mode_selection → starting → streaming →
awaiting_choice → processing_input → (loop back to streaming)

Error states: error_recoverable, error_fatal
Utility states: paused, game_over
```

This prevents common bugs like:
- Clicking choices during streaming
- Race conditions between events
- Invalid state transitions

### History Management (Phase 1.5)

Prevents context window overflow with sliding window strategy:

- Keeps last 8 turns verbatim
- Summarizes older turns using Claude Haiku
- Estimates token usage
- Auto-prunes when approaching limits

### Streaming Architecture

```
Frontend → POST /api/play → Backend → OpenRouter API
                ↓
        SSE Stream ← Parse chunks ← LLM response
                ↓
        Update UI in real-time
```

## API Endpoints

### `POST /api/session`

Create a new anonymous session.

**Response:**
```json
{
  "sessionId": "abc123",
  "token": "xyz789",
  "tokenBudget": 20000,
  "expiresIn": 604800
}
```

### `POST /api/play`

Execute a game turn with SSE streaming.

**Request:**
```json
{
  "sessionId": "abc123",
  "mode": "dungeon",
  "history": [...],
  "player_input": "Go left",
  "model": "anthropic/claude-3-haiku",
  "temperature": 0.7,
  "max_tokens": 600
}
```

**Response:** SSE stream with chunks and final output

### `GET /api/health`

Health check endpoint.

## Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key (required) | - |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | http://localhost:5173 |
| `MODEL_DEFAULT` | Default LLM model | anthropic/claude-3-haiku |
| `TOKEN_BUDGET_PER_SESSION` | Max tokens per session | 20000 |
| `LOG_LEVEL` | Logging level | info |

### Supported Models

Any OpenRouter-compatible model works. Recommended:

- `anthropic/claude-3-haiku` (fast, cheap, good quality)
- `anthropic/claude-3.5-sonnet` (best quality, higher cost)
- `openai/gpt-4` (alternative, higher cost)
- `meta-llama/llama-3.1-70b-instruct` (good balance)

## Troubleshooting

**Problem: Frontend can't connect to backend**
- Check backend is running on port 3000
- Verify CORS settings in `backend/.env`
- Check browser console for errors

**Problem: Streaming not working**
- Ensure you're using a modern browser (Chrome, Firefox, Safari)
- Check network tab for SSE connection
- Verify OpenRouter API key is valid

**Problem: Token budget exceeded**
- Reduce `max_tokens` in game settings
- Lower `TOKEN_BUDGET_PER_SESSION` in backend .env
- Start a new session (reset game)

**Problem: LLM not returning valid JSON**
- Try a different model (Claude models work best)
- Check backend logs for parsing errors
- System falls back to text-only mode automatically

## Development

### Code Formatting

```bash
# Frontend
cd frontend
npm run check

# Backend
cd backend
npm run build  # TypeScript compilation check
```

### Adding New Game Modes

1. Add mode to `GameMode` type in `frontend/src/stores/gameStore.ts`
2. Add lore to `MODE_LORE` in `backend/src/services/promptService.ts`
3. Add initial prompt to `buildInitialPrompt()`
4. Add mode card to `frontend/src/pages/Play.svelte`

### Customizing Prompts

Edit `backend/src/services/promptService.ts`:

- `BASE_SYSTEM_PROMPT`: Core LLM instructions
- `MODE_LORE`: Setting and atmosphere for each mode
- `SAFETY_ADDENDUM`: Content safety rules

## Deployment

### Option A: Separate Hosting

**Frontend** (Netlify/Vercel):
```bash
cd frontend
npm run build
# Deploy dist/ folder
```

**Backend** (Fly.io/Render):
```bash
cd backend
npm run build
# Deploy with Dockerfile or platform CLI
```

### Option B: Docker Compose

```bash
docker-compose up -d
```

(Docker configuration not yet included - see Phase 2 plan)

## Roadmap

See `ai_text_rpg_phase2_enhancements.md` for planned features:

- Enhanced security (JWT sessions, rate limiting)
- LLM-based smart summarization
- Better error recovery and circuit breakers
- Performance optimizations
- Dark/light theme toggle
- Multiplayer support
- And more!

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Built with [OpenRouter](https://openrouter.ai/) for model-agnostic LLM access
- Inspired by classic text adventure games
- Special thanks to Anthropic for Claude models

## Support

- 📖 Documentation: See `/Documentation` folder
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

---

**Happy Adventuring! 🎮✨**
