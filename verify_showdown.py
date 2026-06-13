import time
from playwright.sync_api import sync_playwright
from treys import Card, Evaluator

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://127.0.0.1:5173")

        print("Waiting for game to load...")
        time.sleep(2)

        # Loop until we hit a showdown
        while True:
            showdown_result = page.locator(".showdown-result").text_content()
            if "wins with" in (showdown_result or "") or "win with" in (showdown_result or ""):
                print(f"Showdown reached: {showdown_result}")
                break

            # Try to click any action button
            # "Continue to flop", "Continue to turn", "Continue to river", "Deal next hand"
            continue_btns = page.locator("button.completion-cue__button")
            if continue_btns.count() > 0:
                text = continue_btns.first.text_content()
                if "Continue" in text or "Deal next hand" in text:
                    print(f"Clicking {text}")
                    continue_btns.first.click()
                    time.sleep(1)
                    continue
            
            # Or hero actions (Check, Call)
            hero_actions = page.locator("button.hero-action-button")
            if hero_actions.count() > 0:
                clicked = False
                for i in range(hero_actions.count()):
                    btn_text = hero_actions.nth(i).text_content()
                    if "Check" in btn_text or "Call" in btn_text:
                        print(f"Clicking hero action: {btn_text}")
                        hero_actions.nth(i).click()
                        time.sleep(1)
                        clicked = True
                        break
                if clicked:
                    continue
            
            time.sleep(0.5)

        # We are at showdown. Let's parse the board.
        print("Parsing board...")
        board_ranks = page.locator(".board .card__rank").all_inner_texts()
        board_suits = page.locator(".board .card__suit").all_inner_texts()
        
        # suit symbols to treys char
        suit_map = {"♠": "s", "♥": "h", "♦": "d", "♣": "c"}
        
        board_cards = []
        for r, s in zip(board_ranks, board_suits):
            rank = "T" if r == "10" else r
            board_cards.append(Card.new(f"{rank}{suit_map[s]}"))
        
        print("Board:", [Card.int_to_str(c) for c in board_cards])

        # Parse live players
        seats = page.locator(".seat").all()
        players = []
        for i, seat in enumerate(seats):
            # Check if folded
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

        print("Live Players:", [(p["name"], [Card.int_to_str(c) for c in p["cards"]]) for p in players])

        # Evaluate with treys
        evaluator = Evaluator()
        best_score = 99999
        winners = []
        for p in players:
            score = evaluator.evaluate(board_cards, p["cards"])
            p["score"] = score
            p["class"] = evaluator.get_rank_class(score)
            p["class_string"] = evaluator.class_to_string(p["class"])
            print(f"{p['name']} score: {score} ({p['class_string']})")
            
            if score < best_score:
                best_score = score
                winners = [p["name"]]
            elif score == best_score:
                winners.append(p["name"])
        
        print(f"Treys says winner(s): {winners}")
        print(f"App says: {showdown_result}")

        browser.close()

if __name__ == "__main__":
    main()
