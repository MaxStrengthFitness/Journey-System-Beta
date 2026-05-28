import re

with open("src/components/ClientProfileView.tsx", "r") as f:
    lines = f.readlines()

# Rename the Tab items and states from 'focus' to 'journal'
# 1. TabList configuration
for i, line in enumerate(lines):
    if '{ val: "focus", label: "Focus" }' in line:
        lines[i] = line.replace('{ val: "focus", label: "Focus" }', '{ val: "journal", label: "Journal" }')

    # activeTab
    if 'activeTab !== "journey" && activeTab !== "focus"' in line:
        lines[i] = line.replace('activeTab !== "focus"', 'activeTab !== "journal"')

    # TabContent and Type filter active states
    # Note: we shouldn't change the database value `type: "focus"`. The data structure stays the same, 
    # we just rename the tab `TabsContent value="focus"` to `TabsContent value="journal"`.
    if '<TabsContent value="focus"' in line:
        lines[i] = line.replace('<TabsContent value="focus"', '<TabsContent value="journal"')

# Locate the progress report card
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '<TabsContent value="statistics_disabled"' in line:
        start_idx = i + 1
        break

if start_idx != -1:
    # Find the closing </Card> matching the <Card> at start_idx
    card_depth = 0
    for i in range(start_idx, len(lines)):
        if '<Card ' in lines[i] or '<Card>' in lines[i] or '<Card\n' in lines[i]:
            card_depth += 1
        if '</Card>' in lines[i]:
            card_depth -= 1
            if card_depth == 0:
                end_idx = i
                break

if start_idx != -1 and end_idx != -1:
    extracted_card = lines[start_idx:end_idx+1]
    
    # Remove from old position
    del lines[start_idx:end_idx+1]
    
    # Find the end of `journal` TabsContent
    journal_tab_start = -1
    for i, line in enumerate(lines):
        if '<TabsContent value="journal"' in line:
            journal_tab_start = i
            break
    
    if journal_tab_start != -1:
        # Before we place the extracted_card, let's wrap it in a div or just place it as a sibling to the existing `div` block inside the `TabsContent value="journal"`.
        # The journal tab has a main `<div className="bg-white rounded-3xl ..."`
        # Let's insert the `extracted_card` right after this main div within the `TabsContent`.
        
        # We need to find the `</TabsContent>` closing tag for the `journal` tab.
        tab_depth = 0
        journal_tab_end = -1
        for i in range(journal_tab_start, len(lines)):
            if '<TabsContent' in lines[i]:
                tab_depth += 1
            if '</TabsContent' in lines[i]:
                tab_depth -= 1
                if tab_depth == 0:
                    journal_tab_end = i
                    break
                    
        # Insert extracted_card right before `journal_tab_end`
        lines = lines[:journal_tab_end] + extracted_card + lines[journal_tab_end:]

with open("src/components/ClientProfileView.tsx", "w") as f:
    f.writelines(lines)

print(f"Extracted card from {start_idx} to {end_idx}. Placed before {journal_tab_end}.")
