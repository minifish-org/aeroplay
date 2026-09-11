import { CargoLevel } from './model';

// Every level is solvable; par is the minimum number of pushes.
export const CARGO_LEVELS: CargoLevel[] = [
  {
    name: 'First Delivery',
    tip: 'Push the crate onto the glowing dock. You can push, never pull.',
    map: ['#######', '#     #', '# @$ .#', '#     #', '#######'],
    par: 2
  },
  {
    name: 'Around the Corner',
    tip: 'Walk around a crate to push from a new direction.',
    map: ['#######', '#  .  #', '#     #', '# @$  #', '#     #', '#######'],
    par: 2
  },
  {
    name: 'Two to Go',
    tip: 'The order of your deliveries matters. Keep space to walk.',
    map: [
      '########',
      '# .  . #',
      '# $  $ #',
      '#   @  #',
      '#      #',
      '########'
    ],
    par: 2
  },
  {
    name: 'Harbor Turn',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#   . #',
      '##    #',
      '# $   #',
      '#@#   #',
      '# *   #',
      '#######'
    ],
    par: 4
  },
  {
    name: 'Side Street',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#     #',
      '#$$  ##',
      '#   . #',
      '#  @  #',
      '#.#   #',
      '#######'
    ],
    par: 6
  },
  {
    name: 'The Courtyard',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#   . #',
      '# $ # #',
      '#  $ .#',
      '# @   #',
      '#  #  #',
      '#######'
    ],
    par: 5
  },
  {
    name: 'Cross Traffic',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#     #',
      '# $   #',
      '#  @  #',
      '### $ #',
      '#   ..#',
      '#######'
    ],
    par: 7
  },
  {
    name: 'Tight Quarters',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#   #@#',
      '##  $$#',
      '#   $.#',
      '#.  . #',
      '##    #',
      '#######'
    ],
    par: 7
  },
  {
    name: 'Three Little Parcels',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#. .$@#',
      '# ##$$#',
      '#     #',
      '#  # .#',
      '#     #',
      '#######'
    ],
    par: 7
  },
  {
    name: 'Island Exchange',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#    ##',
      '#@$ $ #',
      '#.#   #',
      '# #   #',
      '#.. $ #',
      '#######'
    ],
    par: 10
  },
  {
    name: 'Last Mile',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '#  .# #',
      '#  $$ #',
      '#     #',
      '## $@##',
      '# ..  #',
      '#######'
    ],
    par: 7
  },
  {
    name: 'Master Courier',
    tip: 'Protect your walking space. A crate in a corner may need Undo.',
    map: [
      '#######',
      '##  #+#',
      '# . *$#',
      '#   # #',
      '# $#  #',
      '#     #',
      '#######'
    ],
    par: 9
  }
];
