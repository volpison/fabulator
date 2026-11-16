# Writing a game (preview)

The Game Prototyping mode plans a game's writing: quests and side-quests, the beats inside them, and (in later steps) the conditions and choices that connect them. **It is being built step by step**, so for now the Timeline, the writing view and the rules exist. The plan is in [Design: Game Prototyping](../technical/game-prototyping.md).

Start one with *File → New game (preview)*.

## Game Timeline (quests and nodes)

The Timeline shows each **quest** as a lane. Rename a quest in place, mark it as the **main quest** or a **side-quest**, move it up or down, and delete it when it is empty. Inside a quest the **nodes** are cards in order: a node is one beat, encounter or conversation.

- **+ Add node** adds a node to the selected node's quest (or the last quest); **+ Add quest** adds a lane. The first quest is the main quest.
- Click a node to edit it below: title, summary, plotline, colour, status, private notes, and "the story may end here" (so it will not be reported as a dead end later).
- **Double-click** a node (or press Enter on it) to write it.
- ◀ ▶ move a node earlier or later in its quest; ✕ deletes it (you are asked first if it holds anything).
- A card shows where the node leads (→ other nodes) and small badges for its conditions (🔒), effects (⚡) and branches (⑂). Hover a badge to read the rule as text.

## Game writing view (Manuscript)

The Manuscript view lists the nodes on the left, grouped by quest and numbered (2.3 is the third node of the second quest), and writes one node on the right: a title, an optional summary, then its **elements**:

- **Narration**, **dialogue** (a character, an optional "how it is said", the words) and private **notes** (never exported). Typing a new name in a dialogue adds that character to the Cast.
- **Choice**: an optional prompt and a list of **options**. Each option has the words the player can say or do and **where it leads** (any other node, or "nowhere yet").
- Under the text, **Leads to** lists the other ways out of the node (not through a choice), each with an optional label.

The keys are the same as in the screenplay: **Enter** adds the next paragraph, **Shift+Enter** a new line, **Ctrl+Enter** a reply from the other speaker, **Backspace** on an empty element removes it, **↑ ↓** at the edge move between elements. A choice that has options cannot change type until its options are removed. The first words written in an *Idea* node make it a *Draft*.

## State, conditions and effects

The game remembers things. Declare them once in the **State** panel (it appears in game projects, next to Characters, Places, Abilities and Notes):

- **Flags** (yes / no, e.g. "Met the beggar") and **numbers** (e.g. "Reputation"). Each card shows how many conditions use it and how many effects set it.
- **Items** (e.g. "Cellar key"), counted as "given or taken" and "needed".

Then use them in **conditions** (what must be true) and **effects** (what changes):

- A **condition** is a row: a flag is set / not set, a number compares (= ≠ < ≤ > ≥) to a value, the player has at least *n* of an item, a character **can** do an Ability (the shared abilities; "The player" is the player's own character), or another node is done. **Any of…** groups conditions where at least one must hold. All the rows of a list must hold.
- An **effect** is a row: set or clear a flag, change a number by an amount (negative lowers it), give or take items, teach a character an ability.

Where they go: a **quest** ("Offered when", in its Timeline lane), a **node** ("This node is available when" and "When this node happens", in the writing view), each **way out** ("Open only when") and each **choice option** ("Offered only when" and "Choosing it"). Every list reads back as a sentence under it ("Available when Met the beggar is set and Reputation ≥ 1."). Something that mentions a flag, item or node nobody declared (or that was deleted) is shown as *“…” (not declared)*, and the Check (below) reports it. Search, Replace, Snapshots, goals and exports for games come later.

## Check, Playtest and Graph

**Tools → Check & playtest…** opens a dialog with two tabs.

**Checks** reads the whole game and lists, worst first:

- **Problems:** a quest that is never offered, a condition that can never hold (nothing sets that flag, no way to earn enough of that number or item, nothing teaches that ability, that node is never reached).
- **Warnings:** a node nothing leads to, or whose conditions can never be met; a dead end (nothing leads out and it is not marked "The story may end here"); two ways out with the same conditions; a flag, item, ability, character or node that was never declared.
- **Notes:** an empty quest, a choice option that leads nowhere yet, a node whose every way out has a condition (the player could get stuck), and state that is declared but unused or changed but never looked at.

Click *Open node* to jump to the place. The check is optimistic: it assumes the player does whatever helps, so everything listed is a real problem, but a clean report does not prove the game can be finished.

**Playtest** lets you set a state by hand (tick flags, type numbers and item counts) and shows which nodes the player can play right now, and which are closed and what each one still needs. *Play* applies a node's effects and marks it done; the choices of the node you are at can be chosen, applying their effects. *Reset* starts again. It follows the rules you wrote and nothing else: it is a planning aid, not a game engine.

**Graph:** on the Timeline, switch **Lanes | Graph** to see nodes as boxes with arrows for every way out (dashed arrows have conditions, loops back are drawn over the top). Show one quest or all of them; click a node to edit it, double-click to write it.
