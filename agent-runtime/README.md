# SentinelIntel Agent Runtime

Phase 3 provides the internal FastAPI/LangGraph runtime foundation only. It uses deterministic test
adapters and makes no model or external network calls.

```bash
python -m pip install -e ".[test]"
python -m pytest
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

From the repository root, verify the TypeScript-to-Python contract with:

```bash
node scripts/check-agent-runtime.ts --base http://127.0.0.1:8000
```
