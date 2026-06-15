# Range Chart Gap Analysis

## Chart Coverage

### Opening Ranges (RFI)
- **6max chart** (covers 2-6 players): LJ, HJ, CO, BTN, SB
- **9max chart** (covers 7-9 players): UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN

### Contextual Ranges
- **vs-RFI chart**: 9max only
- **vs-3bet chart**: 9max only

## Position Availability by Player Count

### 2 Players
- Available: (none directly map)
- Chart: 6max (has LJ, HJ, CO, BTN, SB)
- **Unavailable positions:**
  - BTN/SB: Not in RFI_LABEL_BY_POSITION, not in chart.positions, returns null → UNAVAILABLE
  - BB: Not in RFI_LABEL_BY_POSITION, not in chart.positions → UNAVAILABLE
- **Status:** 0/2 positions available

### 3 Players
- Available: BTN (in chart)
- Chart: 6max
- **Unavailable positions:**
  - SB: Not in RFI_LABEL_BY_POSITION, but IS in chart.positions → AVAILABLE (direct match)
  - BB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 2/3 positions available

### 4 Players
- Available: BTN (chart), CO (chart)
- Chart: 6max
- **Unavailable positions:**
  - SB: Not in RFI_LABEL_BY_POSITION, but IS in chart.positions → AVAILABLE
  - BB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 3/4 positions available

### 5 Players
- Available: BTN (chart), CO (chart), HJ (chart)
- Chart: 6max
- **Unavailable positions:**
  - SB: In chart.positions → AVAILABLE
  - BB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 4/5 positions available

### 6 Players
- Chart: 6max (complete coverage for this size)
- Available: LJ, HJ, CO, BTN, SB (all in chart)
- **Unavailable positions:**
  - BB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 5/6 positions available

### 7 Players
- Chart: 9max
- **Available positions:**
  - BTN (in RFI_LABEL_BY_POSITION)
  - UTG+2 (in RFI_LABEL_BY_POSITION)
  - LJ (in RFI_LABEL_BY_POSITION)
  - HJ (in RFI_LABEL_BY_POSITION)
  - CO (in RFI_LABEL_BY_POSITION)
- **Unavailable positions:**
  - SB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
  - BB: Not in chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 5/7 positions available

### 8 Players
- Chart: 9max
- **Available positions:**
  - BTN, UTG+1, UTG+2, LJ, HJ, CO (all in 9max)
- **Unavailable positions:**
  - SB: Not in 9max chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
  - BB: Not in 9max chart or RFI_LABEL_BY_POSITION → UNAVAILABLE
- **Status:** 6/8 positions available

### 9 Players (Full House)
- Chart: 9max (complete for this size)
- **Available positions:**
  - UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN (all in 9max)
- **Unavailable positions:**
  - SB: Not in 9max → UNAVAILABLE
  - BB: Not in 9max → UNAVAILABLE
- **Status:** 7/9 positions available

## Summary of Unavailable RFI Combos

| Players | Unavailable | Total | % Covered |
|---------|------------|-------|-----------|
| 2       | 2 (BTN/SB, BB) | 2 | 0% |
| 3       | 1 (BB) | 3 | 67% |
| 4       | 1 (BB) | 4 | 75% |
| 5       | 1 (BB) | 5 | 80% |
| 6       | 1 (BB) | 6 | 83% |
| 7       | 2 (SB, BB) | 7 | 71% |
| 8       | 2 (SB, BB) | 8 | 75% |
| 9       | 2 (SB, BB) | 9 | 78% |

**Total unavailable: 12 out of 44 possible positions (73% coverage)**

## RFI Coverage Issues

### Universal Issue: Blinds
- **SB (Small Blind)** only exists in 6max chart, unavailable for 7-9 players
- **BB (Big Blind)** never covered—no RFI charts for blind positions (rational: blinds don't open)

### Rare Issue: 2-Player Game
- **BTN/SB** combined position has no explicit chart match
- Current code would fail entirely for 2-player games

## Contextual Range Issues (vs-RFI, vs-3bet)

Both vs-RFI and vs-3bet charts are **9max only**:

### vs-RFI Coverage
Responder positions: BB, BTN, CO, HJ, LJ, SB
Opener positions: UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN

**Unavailable scenarios:**
- Any vs-RFI scenario with **2-6 players** (chart requires 9-max positions)
- 7-8 player games where responder is **not in the 9max responder set** (would be SB or BB acting out of position)

### vs-3bet Coverage  
All 9-max positions included as openers and 3-bettors

**Unavailable scenarios:**
- Any vs-3bet scenario with **2-6 players** (chart requires 9-max positions)

## Recommended Fix Strategy

### Option A: Fallback Mapping (Minimal)
Map out-of-range players to nearest covered chart:
- **2-6 players → use 6max chart** (already done for RFI)
- **7-9 players → use 9max chart** (already done for RFI)
- **SB/BB → fallback to nearest opening position**
  - SB → use CO range as approximation
  - BB → use UTG range as approximation (conservative)

### Option B: Add Missing Charts (Comprehensive)
Create charts for:
- 2-max (2 players)
- SB and BB ranges (any table size)
- 3-4 max specialized charts

### Option C: Hybrid
- Add SB/BB specialized ranges for all sizes
- Keep 2-max fallback to 6max with CO approximation
- This would eliminate the "universal blind issue" while deferring rare 2-player case

## Most Likely Root Cause of "No Chart for XYZ"

When user sees "no chart for xyz" it's almost certainly:
1. **2-player game** (fully unsupported)
2. **SB or BB position** (never supported)
3. **Facing action in 2-6 player game** (vs-RFI/vs-3bet require 9max)
4. **Rare 4+ raise scenarios** (line 32-34 in contextual-ranges.js)

Total combinations that would fail with current setup: **~100+ out of ~500 possible game states**
