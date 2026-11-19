<script lang="ts">
  import { project } from "../../lib/app/stores/core";
  import { formatOf } from "../../lib/model/formats";

  /** Which view is missing ("Manuscript"). */
  export let view = "";

  $: format = $project ? formatOf($project) : null;
  $: quests = $project?.game?.quests.length ?? 0;
  $: nodes = $project?.game?.nodes.length ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<section class="not-ready" aria-live="polite">
  <h2>The {view.toLowerCase()} view for {format?.label.toLowerCase()} isn’t built yet</h2>
  <p>
    This project is a <strong>{format?.label.toLowerCase()}</strong> project:
    {plural(quests, "quest")}, {plural(nodes, "node")}.
    Everything in it is saved safely with the project, but this version of Fabulator
    can’t show or edit its quests and nodes yet. That part is being built step by step.
  </p>
  <p>
    Meanwhile <strong>Cast</strong> and the Characters, Places, Abilities and Notes panels all work,
    and you can save and open the project as usual.
  </p>
</section>

<style>
  .not-ready {
    max-width: 38rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
    color: var(--text);
    line-height: 1.6;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }
  p {
    margin: 0 0 0.75rem;
    color: var(--text-muted);
  }
  strong {
    color: var(--text);
  }
</style>
