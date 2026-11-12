<script lang="ts">
  import { project } from "../lib/stores";

  /** Which view is missing ("Manuscript"). */
  export let view = "";
  import { formatOf } from "../lib/formats";

  $: format = $project ? formatOf($project) : null;
  $: issues = $project?.issues.length ?? 0;
  $: pages = $project?.pages.length ?? 0;
  $: panels = $project?.pages.reduce((n, p) => n + p.panels.length, 0) ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<section class="not-ready" aria-live="polite">
  <h2>The {view.toLowerCase()} view for {format?.label.toLowerCase()}s isn’t built yet</h2>
  <p>
    This project is a <strong>{format?.label.toLowerCase()}</strong>:
    {plural(issues, "issue")}, {plural(pages, "page")}, {plural(panels, "panel")}.
    Everything in it is saved safely with the project, but this version of Fabulator
    can’t show or edit its panels and dialogue yet. That part is being built step by step.
  </p>
  <p>
    Meanwhile the <strong>Timeline</strong> (pages, plots and stages), <strong>Cast</strong> and the
    Characters, Places and Notes panels all work, and you can save and open the project as usual.
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
