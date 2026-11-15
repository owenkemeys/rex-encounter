// PATCHREX: which animal the simulation builds. The sim reads its species' dimensions at module load (sim/rex.js `DIM`), so the
// choice is made here, once, from the page's URL: anything with 'rex=ours' in the hash is the original animal and its generated
// body; otherwise the downloaded model's proportions (species/patchrex.js), #test pages included. The studio page and Node
// (the standalone tests: no `location`) always get the original.
import { TYRANNOSAURUS as ORIGINAL } from './tyrannosaurus.js';
import { PATCHREX } from './patchrex.js';

export const USE_PATCH = typeof location !== 'undefined' && !/rex=ours/.test(location.hash) && !/studio/.test(location.pathname || '');
export const TYRANNOSAURUS = USE_PATCH ? PATCHREX : ORIGINAL;
