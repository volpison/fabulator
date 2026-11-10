<script lang="ts">
  import {
    project,
    selectedScene,
    selectedSceneId,
    sceneHighlight,
    snapshotsOpen,
    focusMode,
    updateSceneContent,
    updateSceneTitle,
    updateSceneSummary,
    linkCharacterToScene,
    unlinkCharacterFromScene,
    linkPlaceToScene,
    unlinkPlaceFromScene,
    moveScene,
    addCharacter,
    addPlace,
  } from "../lib/stores";
  import type { Scene, Character, Place } from "../lib/types";
  import { readingOrder, chapterNumber, sceneDropTarget } from "../lib/model";
  import RichTextEditor from "./RichTextEditor.svelte";
  import { stats } from "../lib/goalsStore";
  import { formatCount } from "../lib/wordcount";
  import SceneLabels from "./SceneLabels.svelte";
  import ContinuityPanel from "./ContinuityPanel.svelte";
  import {
    entitiesOf,
    findUnlinkedMentions,
    type EntityType,
    type MentionInfo,
    type MentionSuggestion,
  } from "../lib/mentions";

  /** Dismissed suggestion keys for this session: "sceneId:type:entityId" */
  let dismissed = new Set<string>();

  function selectScene(id: string) {
    selectedSceneId.set(id);
  }

  // NOTE: full file restored in follow-up if truncated — see branch checks
  // This placeholder will be replaced.
</script>

<div class="manuscript">Manuscript loading…</div>
