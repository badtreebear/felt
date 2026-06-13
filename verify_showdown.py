import time
import json
from playwright.sync_api import sync_playwright
from treys import Card, Evaluator

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://127.0.0.1:5173")

        print("Waiting for game to load...")
        page.wait_for_function("window.__feltActions !== undefined", timeout=10000)

        page.evaluate("window.__feltActions.setActionDelayMs(0)")

        total_hands = 200
        hands_played = 0
        determinism_checks = 5
        
        while hands_played < total_hands:
            hands_played += 1
            print(f"--- Playing Hand {hands_played}/{total_hands} ---")
            
            # Record state at start of hand
            state_at_start = page.evaluate("window.__feltState()")
            starting_stacks_sum = sum(state_at_start["hand"]["startingStacks"].values())
            seed = state_at_start["hand"]["seed"]
            print(f"Seed: {seed}")
            
            check_determinism = (hands_played <= determinism_checks)
            
            play_to_end(page)

            state_at_end = page.evaluate("window.__feltState()")
            
            # Verification: Pot conservation
            final_stacks_sum = sum(state_at_end["config"]["tableStacks"].values())
            if abs(starting_stacks_sum - final_stacks_sum) > 0.01:
                print(f"FAIL [Pot Conservation]: Seed {seed}. Started with {starting_stacks_sum}, ended with {final_stacks_sum}")
                dump_state(state_at_end)
                break
                
            # Verification: Showdown / Treys
            if not verify_showdown(page, state_at_end):
                print(f"FAIL [Showdown]: Seed {seed} mismatch with Treys.")
                dump_state(state_at_end)
                break
                
            if check_determinism:
                print("Checking determinism...")
                serialized_state_1 = json.dumps(state_at_end, sort_keys=True)
                page.evaluate("window.__feltActions.replayHand()")
                play_to_end(page)
                state_at_replay_end = page.evaluate("window.__feltState()")
                serialized_state_2 = json.dumps(state_at_replay_end, sort_keys=True)
                if serialized_state_1 != serialized_state_2:
                    print(f"FAIL [Determinism]: Seed {seed} replay state does not match.")
                    break
                print("Determinism passed.")

            page.evaluate("window.__feltActions.dealNewHand()")

        if hands_played == total_hands:
            print(f"SUCCESS: {total_hands} hands verified cleanly.")

        browser.close()

def play_to_end(page):
    while True:
        state = page.evaluate("window.__feltState()")
        
        if state["hand"]["street"] == "showdown" or (state["hand"]["postflop"] and state["hand"]["postflop"]["result"] == "winner") or (not state["hand"]["postflop"] and state["hand"]["preflop"] and state["hand"]["preflop"]["result"] == "winner"):
            time.sleep(0.1) # let render finish
            break
            
        continue_btns = page.locator("button.completion-cue__button")
        if continue_btns.count() > 0:
            text = continue_btns.first.text_content()
            if "Continue" in text or "Deal next hand" in text:
                continue_btns.first.click()
                time.sleep(0.05)
                continue
                
        hero_actions = page.locator("button.hero-action-button")
        if hero_actions.count() > 0:
            clicked = False
            for i in range(hero_actions.count()):
                btn_text = hero_actions.nth(i).text_content()
                if "Check" in btn_text or "Call" in btn_text:
                    hero_actions.nth(i).click()
                    clicked = True
                    time.sleep(0.05)
                    break
            if clicked:
                continue

        time.sleep(0.05)

def verify_showdown(page, state):
    if state["hand"]["street"] != "showdown":
        return True

    showdown_result = page.locator(".showdown-result").text_content()
    board_ranks = page.locator(".board .card__rank").all_inner_texts()
    board_suits = page.locator(".board .card__suit").all_inner_texts()
    
    suit_map = {"♠": "s", "♥": "h", "♦": "d", "♣": "c"}
    board_cards = []
    for r, s in zip(board_ranks, board_suits):
        rank = "T" if r == "10" else r
        board_cards.append(Card.new(f"{rank}{suit_map[s]}"))
        
    seats = page.locator(".seat").all()
    players = []
    for seat in seats:
        fold_stamp = seat.locator(".fold-stamp")
        if fold_stamp.count() > 0:
            continue
        
        name = seat.locator(".seat__title strong").text_content()
        ranks = seat.locator(".card__rank").all_inner_texts()
        suits = seat.locator(".card__suit").all_inner_texts()
        
        if len(ranks) == 2:
            hole_cards = []
            for r, s in zip(ranks, suits):
                rank = "T" if r == "10" else r
                hole_cards.append(Card.new(f"{rank}{suit_map[s]}"))
            players.append({"name": name, "cards": hole_cards})

    evaluator = Evaluator()
    best_score = 99999
    winners = []
    for p in players:
        score = evaluator.evaluate(board_cards, p["cards"])
        if score < best_score:
            best_score = score
            winners = [p["name"]]
        elif score == best_score:
            winners.append(p["name"])

    print(f"Treys winners: {winners}")
    print(f"App result: {showdown_result}")
    
    for w in winners:
        if w not in showdown_result:
            return False
            
    for p in players:
        if p["name"] not in winners and p["name"] in showdown_result:
            return False
            
    return True

def dump_state(state):
    with open("failing_state.json", "w") as f:
        json.dump(state, f, indent=2)

if __name__ == "__main__":
    main()
