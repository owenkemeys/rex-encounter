// Property-based helpers for things and agents the animal senses.
// Keeps the brain driven by physical properties (edible, bright, hot, missile, light, observer)
// while remaining backward-compatible with legacy kind/id names used by existing worlds.

/** Something the animal can smell or eat (explicit edible flag, scent, or legacy meat/carcass kind). */
export const isEdible = (o) => !!(o && (o.edible === true || (o.edible !== false && ((o.scent || 0) > 0 || o.kind === 'meat' || o.kind === 'carcass'))));

/** Something glowing or emitting light/heat that draws investigation (bright/hot property, or legacy flare kind). */
export const isBright = (o) => !!(o && ((o.bright || 0) > 0 || o.hot === true || o.kind === 'flare'));

/** Currently emitting light or heat (used to tell an active light source from a spent one). */
export const isLit = (o) => !!(o && ((o.bright || 0) > 0 || o.hot === true));

/** Emitting real heat/fire close enough to trigger fire wariness (explicit hot flag, or a lit flare). */
export const isHot = (o) => !!(o && (o.hot === true || (o.hot !== false && o.kind === 'flare' && (o.bright || 0) > 0)));

/** A thrown/fired projectile that can strike the animal (explicit missile flag, or legacy stone kind). */
export const isMissile = (o) => !!(o && (o.missile === true || o.kind === 'stone'));

/** A non-bodied watcher/camera agent that the animal ignores for physical contact and predation. */
export const isObserver = (a) => !!(a && (a.ghost || a.observer || a.id === 'observer'));

/** An agent carrying an active directional light source (general light property, or legacy torch). */
export const hasLight = (a) => !!(a && (a.light || a.torch));

/** Whether an action/object's `by` owner matches the animal's current target (or legacy `'you'` id). */
export const isByTarget = (by, target) => !!(by && ((target && by === target.id) || by === 'you'));
