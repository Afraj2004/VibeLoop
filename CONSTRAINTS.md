# VibeLoop — Architectural Constraints & Guardrails

1. **No Database Calls in WebSocket Hot Path**: The signaling pipeline (`rtc_offer`, `rtc_answer`, `ice_candidate`, `find_match`) must execute entirely in memory/Redis. DB calls are offloaded asynchronously.
2. **20-Second Contact History Minimum**: Matches must NOT be recorded in recent history or allow persistence unless active connection duration exceeds 20 seconds.
3. **10 VIBE Daily Meet-to-Earn Cap**: A user can earn a maximum of 10.0 VIBE tokens per 24-hour cycle via active video time to prevent automated farming.
4. **30-Message Ephemeral Messaging Cap**: Direct chats in matching session drawers must auto-truncate at 30 messages.
5. **Strict Cyber-Luxe Visual System**:
   - Backgrounds: Obsidian `#08090D`
   - Glassmorphic Cards: `#12151E` (with border `#1E293B` or slate-80