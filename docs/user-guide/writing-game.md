# Writing a game (preview)

The Game Prototyping mode plans a game's writing: quests and side-quests, the beats inside them, and (in later steps) the conditions and choices that connect them. **It is being built step by step**, so for now the Timeline and the writing view exist. The plan is in [Design: Game Prototyping](../technical/game-prototyping.md).

Start one with *File → New game (preview)*.

## Game Timeline (quests and nodes)

The Timeline shows each **quest** as a lane. Rename a quest in place, mark it as the **main quest** or a **side-quest**, move it up or down, and delete it when it is empty. Inside a quest the **nodes** are cards in order: a node is one beat, encounter or conversation.

- **+ Add node** adds a node to the selected node's quest (or the last quest); **+ Add quest** adds a lane. The first quest is the main quest.
- Click a node to edit it below: title, summary, plotline, colour, status, private notes, and "the story may end here" (so it will not be reported as a dead end later).
- **Double-click** a node (or press Enter on it) to write it.
- ◀ ▶ move a node earlier or later in its quest; ✕ deletes it (you are asked first if it holds anything).
- A card shows where the node leads (→ other nodes) and small badges for its conditions (🔒), effects (⚡) and branches (⑂). The conditions, effects and links themselves arrive in a later step; until then these stay empty.

## Game writing view (Manuscript)

The Manuscript view lists the nodes on the left, grouped by quest and numbered (2.3 is the third node of the second quest), and writes one node on the right: a title, an optional summary, then its **elements**:

- **Narration**, **dialogue** (a character, an optional "how it is said", the words) and private **notes** (never exported). Typing a new name in a dialogue adds that character to the Cast.
- **Choice**: an optional prompt and a list of **options**. Each option has the words the player can say or do and **where it leads** (any other node, or "nowhere yet").
- Under the text, **Leads to** lists the other ways out of the node (not through a choice), each with an optional label.

The keys are the same as in the screenplay: **Enter** adds the next paragraph, **Shift+Enter** a new line, **Ctrl+Enter** a reply from the other speaker, **Backspace** on an empty element removes it, **↑ ↓** at the edge move between elements. A choice that has options cannot change type until its options are removed. The first words written in an *Idea* node make it a *Draft*.

Conditions on a node, an option or a way out, and effects, come in the next step; the 🔒 and ⚡ badges stay empty until then. Search, Replace, Snapshots, goals and exports for games come in later steps.
