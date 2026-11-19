// Characters, places and abilities, and their links to scenes.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { removeCastFromPages } from "../../comic/comicedit";
import { removeCastFromScenes } from "../../screenplay/screenplayedit";
import { removeCastFromNodes } from "../../game/gameedit";
import type { Ability, Character, Place } from "../../model/types";
import { project, touch, uid } from "./core";

export function updateCharacter(id: string, fields: Partial<Character>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      characters: proj.characters.map((c) =>
        c.id === id ? { ...c, ...fields } : c
      ),
    };
  });
}

export function addCharacter(name?: string): string {
  const id = uid("char");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const character: Character = {
      id,
      name: name?.trim() || "New Character",
      aliases: [],
      description: "",
      role: "",
      category: "Main",
      traits: [],
      notes: "",
    };
    return { ...proj, characters: [...proj.characters, character] };
  });
  return id;
}

export function deleteCharacter(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return removeCastFromNodes(removeCastFromScenes(removeCastFromPages(
      {
        ...proj,
        characters: proj.characters.filter((c) => c.id !== id),
        // Also remove from scene references
        scenes: proj.scenes.map((s) => ({
          ...s,
          character_ids: s.character_ids.filter((cid) => cid !== id),
        })),
      },
      "character",
      id
    ), "character", id), "character", id);
  });
}

export function updatePlace(id: string, fields: Partial<Place>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      places: proj.places.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    };
  });
}

export function addPlace(name?: string): string {
  const id = uid("place");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const place: Place = {
      id,
      name: name?.trim() || "New Place",
      aliases: [],
      description: "",
      location: "",
      notes: "",
    };
    return { ...proj, places: [...proj.places, place] };
  });
  return id;
}

export function deletePlace(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return removeCastFromNodes(removeCastFromScenes(removeCastFromPages(
      {
        ...proj,
        places: proj.places.filter((p) => p.id !== id),
        scenes: proj.scenes.map((s) => ({
          ...s,
          place_ids: s.place_ids.filter((pid) => pid !== id),
        })),
      },
      "place",
      id
    ), "place", id), "place", id);
  });
}

export function updateAbility(id: string, fields: Partial<Ability>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      abilities: proj.abilities.map((a) => (a.id === id ? { ...a, ...fields } : a)),
    };
  });
}

export function addAbility(name?: string): string {
  const id = uid("ability");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const ability: Ability = {
      id,
      name: name?.trim() || "New Ability",
      aliases: [],
      description: "",
      notes: "",
    };
    return { ...proj, abilities: [...proj.abilities, ability] };
  });
  return id;
}

/** Delete an ability; the characters that had it simply lose it. */
export function deleteAbility(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      abilities: proj.abilities.filter((a) => a.id !== id),
      characters: proj.characters.map((c) =>
        (c.ability_ids ?? []).includes(id)
          ? { ...c, ability_ids: (c.ability_ids ?? []).filter((x) => x !== id) }
          : c
      ),
    };
  });
}

export function linkCharacterToScene(sceneId: string, characterId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        if (s.character_ids.includes(characterId)) return s;
        return { ...s, character_ids: [...s.character_ids, characterId] };
      }),
    };
  });
}

export function unlinkCharacterFromScene(sceneId: string, characterId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              character_ids: s.character_ids.filter((id) => id !== characterId),
            }
          : s
      ),
    };
  });
}

export function linkPlaceToScene(sceneId: string, placeId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        if (s.place_ids.includes(placeId)) return s;
        return { ...s, place_ids: [...s.place_ids, placeId] };
      }),
    };
  });
}

export function unlinkPlaceFromScene(sceneId: string, placeId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId
          ? { ...s, place_ids: s.place_ids.filter((id) => id !== placeId) }
          : s
      ),
    };
  });
}
