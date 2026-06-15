# User-Facing Messages for Unavailable Ranges

## Where These Messages Come From

### Code paths that generate "No Chart" messages:

1. **opening-ranges.js:42-49** (position not in chart)
   ```
   No RFI chart for {position} yet.
   ```
   Triggered when `positionToRfiLabel(position)` returns null (position not in lookup table)

2. **contextual-ranges.js:46, 56, 128** (missing vs-RFI/vs-3bet spots)
   ```
   {position} vs {openerPosition} open - no chart for this spot yet
   {contextTitle} - no chart for this spot yet
   ```
   Triggered when spot lookup returns undefined

3. **contextual-ranges.js:118** (unusual 3-bet scenario)
   ```
   {openerPosition} - no 3-bettor chart for this spot yet
   ```
   Triggered in 4+ raise scenarios

4. **contextual-ranges.js:33** (4+ bets)
   ```
   {openerPosition} - no chart for this spot yet
   ```
   Triggered when `raiseCount > 2`

---

## Specific Scenarios Users Will Encounter

### Scenario 1: Playing Big Blind
**Situation:** User is in the BB, someone opens
**What happens:**
- `getOpeningRange({ players: any, position: "BB" })` is called
- Position "BB" is NOT in RFI_LABEL_BY_POSITION
- Position "BB" is NOT in any of the 6max/9max charts
- Returns: `chartAvailable: false`, `message: "No RFI chart for BB yet."`

**Message shown:** "No RFI chart for BB yet."
**Frequency:** Every time user is in the BB (happens in ~20% of hands)
**Severity:** HIGH - very common situation

---

### Scenario 2: Playing Small Blind at 7+ Table
**Situation:** User is in the SB, 7+ player game, someone opens
**What happens:**
- `getOpeningRange({ players: 7+, position: "SB" })` is called
- Position "SB" is NOT in RFI_LABEL_BY_POSITION (only in 6max chart)
- Using 9max chart which doesn't have SB
- Returns: `chartAvailable: false`, `message: "No RFI chart for SB yet."`

**Message shown:** "No RFI chart for SB yet."
**Frequency:** Every SB action at 7-9 player tables
**Severity:** HIGH - common situation at bigger games

---

### Scenario 3: Defending Open at Short Tables (2-6 Players)
**Situation:** 4-player game, CO opens, user in BB wants to know how to defend
**What happens:**
1. `getRangeForSpot()` is called with preflop scenario
2. Detects this is a vs-RFI situation (line 19-20)
3. Tries to find spot in `vsRfiChart` (9max only)
4. Since table is 4 players, responder positions don't match 9max expectations
5. `findVsRfiSpot()` returns undefined (line 55-56)
6. Returns: fallback opening range with message

**Message shown:** "BB vs CO open - no chart for this spot yet. Showing CO RFI."
**Frequency:** Every defend scenario at short tables
**Severity:** CRITICAL - makes short-table play completely unavailable

---

### Scenario 4: Dealing with 2-Player Game
**Situation:** Heads-up or 2-player ring game
**What happens:**
1. For BTN/SB position: not in any chart, not in RFI labels → UNAVAILABLE
2. For BB position: not in any chart → UNAVAILABLE
3. Any vs-RFI/vs-3bet situation: chart is 9max only → UNAVAILABLE

**Messages shown:**
- "No RFI chart for BTN/SB yet."
- "No RFI chart for BB yet."
- Any defend situation: fallback to RFI

**Frequency:** Every action in a 2-player game
**Severity:** CRITICAL - makes 2-player completely unusable

---

### Scenario 5: Defending with Opener in vs-3bet Situation
**Situation:** User opens CO, SB 3-bets, user needs continuation range
**At 4-6 players:**
1. `getRangeForSpot()` is called with preflop.raiseCount === 2 (the 3-bet)
2. `threeBetContinuationRange()` is invoked (line 29)
3. Tries to find spot in `vsThreeBetChart` (9max only)
4. Table is 4 players, not 9max
5. `findVsThreeBetSpot()` returns undefined (line 127)
6. Returns: fallback opening range

**Message shown:** "CO vs SB 3-bet - no chart for this spot yet. Showing CO RFI."
**Frequency:** Every 3-bet response situation at short tables
**Severity:** HIGH - common scenario, especially at cash games

---

### Scenario 6: 4+ Bet Scenario
**Situation:** User opens CO, SB 3-bets, user 4-bets, SB shoves and user needs decision
**What happens:**
1. `getRangeForSpot()` detects `preflop.raiseCount > 2` (line 32)
2. Returns fallback: "no chart for this spot yet"
3. No matter the table size or positions

**Message shown:** "{position} - no chart for this spot yet"
**Frequency:** Rare (deep stacks, aggressive play)
**Severity:** MEDIUM - uncommon but frustrating when it happens

---

## Distribution of Errors in Typical Session

**Assuming 100 hands, average 6-player cash game:**

| Scenario | Frequency | % of Hands |
|----------|-----------|-----------|
| BB ranges unavailable | ~17 hands | 17% |
| SB ranges unavailable | ~0 hands | 0% (6p has SB chart) |
| vs-RFI fallback | ~25 hands | 25% |
| vs-3bet fallback | ~5 hands | 5% |
| 4+ bet fallback | ~1 hand | 1% |
| **Total error messages** | **~48 hands** | **48%** |

**At a 2-4 player game:** Nearly 100% of hands would show some error.

---

## Root Cause by Message

| Message | Position | Root Cause | Fix Priority |
|---------|----------|-----------|--------------|
| "No RFI chart for BB yet" | Any size | BB never in charts | Add BB chart |
| "No RFI chart for SB yet" | 7-9 players | SB only in 6max | Add 9max SB chart |
| "{pos} vs {opener} - no chart" | 2-6 players | vs-RFI is 9max only | Add short-table defend charts |
| "{opener} - no 3-bettor chart" | 2-6 players | vs-3bet is 9max only | Add short-table 3bet charts |
| "{position} - no chart (4+ bets)" | Any | No ultra-deep charts | Acceptable edge case |

---

## Minimum Viable Fix

To eliminate ~70% of error messages, implement:

1. **SB RFI chart** (1 new chart)
   - Eliminates "No RFI chart for SB yet" for 7-9p
   - Low effort (transcribe from source)

2. **BB RFI chart** (1 new chart)  
   - Eliminates "No RFI chart for BB yet" universally
   - Low effort (more conservative than CO)

3. **Fallback mapping for 2-6p vs-RFI/vs-3bet**
   - Map to nearest 9max positions
   - 2-3 lines of code
   - Eliminates fallback messages at short tables

This would reduce the 48% error rate above to ~5% (only rare 4+ bet scenarios).
