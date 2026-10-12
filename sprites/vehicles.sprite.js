/* Tesco Trueno sprites: vehicles.
   Everything with wheels: Trueno, the four NPC models, the trolley.
   Open THIS file in sprite-editor.html and save it back here. Everything
   between the backticks is plain sprite text; the line around it is only
   there so the game can load it from disk without a web server. */
(window.SPRITE_SOURCES = window.SPRITE_SOURCES || []).push(String.raw`
# tesco-trueno sprite format v2
#
# axes   f = along facing (+ forward), l = lateral (+ left), z = up. metres.
# box    box <f> <l> <z>  <L> <W> <H>  <colour>  [flags]
#          f,l are the box centre; z is its BASE. L is along f, W along l, H up.
# colour #rrggbb | #rrggbbaa | none | paint
#          paint: the vehicle's own colour, chosen per car and kept by its owner
# flags  n=<label>          a name, for the editor list
#        mir=1              also draw the mirror image at -l (swaps lft/rgt)
#        rot=<radians>      extra yaw, added to the sprite heading
#        top= bot= fwd= aft= lft= rgt=   per-face colour, overrides the base
#        roof=<frac>        inset glass panel on the top face, this fraction of L
#        glass=<colour>     colour of that inset panel
#        mesh=<spacing>     stroke wire mesh at this spacing instead of filling
#        lit=<0..1>         self-lit: holds its colour at night (lamps, beacons)
#
# v2, per sprite (before its first state):
#   size <L> <W> <H>              footprint and height, for collision and z
#   anchor <name> <f> <l> <z>     a named point the game hangs things on:
#                                 tickets, a carried car, a hitch, a door
# v2, inside a state:
#   part <name> <f> <l> <z>       boxes after this belong to a moving part that
#                                 pivots about (f,l,z); the game turns it about
#                                 the vertical (yaw) or raises it (lift). Boxes
#                                 are always drawn level, so parts cannot tilt.
#   endpart                       back to the body
#
# A '#' starts a comment only at the beginning of a line, because colours also
# begin with '#'. For a comment on the end of a box line, use ';' instead.
#
# Faces are named in the box's own frame, so they stay right through rotation.
# Any box with mesh, a none face or an alpha face renders all six faces sorted
# back to front; fully opaque boxes cull their rear faces.

sprite trueno
mass 1120
state as-built
  box  1.22  0.84  0.00   0.60 0.24 0.34  #0d0e10  mir=1 n=wheel.front
  box -1.26  0.84  0.00   0.60 0.24 0.34  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.18   4.02 1.56 0.32  #15171a  n=sill
  box  0.00  0.00  0.50   3.92 1.44 0.30  #e9eae5  n=body
  box -0.36  0.00  0.80   1.84 1.26 0.36  #e9eae5  roof=0.60 n=cabin
  box  1.52  0.44  0.80   0.26 0.30 0.20  #f4f5f1  mir=1 lit=1 n=lamp
  box -1.99  0.42  0.56   0.10 0.30 0.18  #c0392b  mir=1 lit=0.8 n=tail
  box  1.99  0.00  0.34   0.10 1.04 0.24  #101214  n=grille
state chunkier
  box  1.25  0.86  0.00   0.74 0.34 0.44  #0d0e10  mir=1 n=wheel.front
  box -1.30  0.86  0.00   0.74 0.34 0.44  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.26   3.86 1.64 0.36  #15171a  n=sill
  box  0.00  0.00  0.62   3.66 1.50 0.38  #e9eae5  n=body
  box -0.40  0.00  1.00   1.76 1.38 0.52  #e9eae5  roof=0.62 n=cabin
  box  1.05  0.00  1.00   0.44 0.52 0.10  #e9eae5  n=bonnet.vent
  box  1.44  0.46  1.00   0.34 0.34 0.22  #f4f5f1  mir=1 n=lamp
  box -1.86  0.46  0.66   0.14 0.36 0.24  #c0392b  mir=1 n=tail
  box  1.86  0.00  0.40   0.14 1.10 0.28  #101214  n=grille
state hunkered
  box  1.28  0.94  0.00   0.66 0.30 0.36  #0d0e10  mir=1 n=wheel.front
  box -1.30  0.94  0.00   0.66 0.30 0.36  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.12   4.14 1.72 0.30  #15171a  n=sill
  box  0.00  0.00  0.42   4.00 1.56 0.26  #e9eae5  n=body
  box -0.30  0.00  0.68   1.92 1.34 0.30  #e9eae5  roof=0.58 n=cabin
  box -2.00  0.00  0.86   0.16 1.42 0.16  #15171a  n=spoiler
  box  2.10  0.00  0.10   0.14 1.62 0.14  #15171a  n=lip
  box  1.62  0.46  0.68   0.24 0.32 0.16  #f4f5f1  mir=1 n=lamp
  box -2.06  0.44  0.48   0.10 0.32 0.16  #c0392b  mir=1 n=tail
  box  2.06  0.00  0.28   0.10 1.10 0.20  #101214  n=grille

sprite jazz
mass 1050
state parked
  box  1.30  0.78  0.00   0.56 0.22 0.30  #0d0e10  mir=1 n=wheel.front
  box -1.30  0.78  0.00   0.56 0.22 0.30  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.16   3.80 1.60 0.36  #7f868a  n=sill
  box  0.00  0.00  0.52   3.86 1.66 0.54  #a8b0ae  n=body
  box -0.15  0.00  1.06   2.30 1.52 0.44  #a8b0ae  roof=0.72 n=cabin
  box  1.96  0.55  0.78   0.14 0.36 0.16  #f4f5f1  mir=1 n=lamp
  box -1.96  0.62  0.86   0.10 0.22 0.28  #c0392b  mir=1 n=tail
  box  1.97  0.00  0.56   0.08 0.90 0.20  #14171a  n=grille

sprite a4
mass 1600
state parked
  box  1.42  0.86  0.00   0.64 0.24 0.33  #0d0e10  mir=1 n=wheel.front
  box -1.42  0.86  0.00   0.64 0.24 0.33  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.18   4.56 1.74 0.28  #4c5359  n=sill
  box  0.00  0.00  0.46   4.62 1.80 0.40  #6b7278  n=body
  box -0.30  0.00  0.86   2.10 1.62 0.40  #6b7278  roof=0.66 n=cabin
  box -1.75  0.00  0.86   1.00 1.70 0.10  #6b7278  n=boot
  box  1.55  0.00  0.86   1.10 1.66 0.06  #6b7278  n=bonnet
  box  2.34  0.62  0.66   0.12 0.42 0.20  #f4f5f1  mir=1 n=lamp
  box  2.36  0.00  0.42   0.08 1.10 0.32  #14171a  n=grille
  box -2.36  0.64  0.70   0.08 0.34 0.18  #c0392b  mir=1 n=tail

sprite discovery
mass 2400
state parked
  box  1.48  0.90  0.00   0.76 0.28 0.40  #0d0e10  mir=1 n=wheel.front
  box -1.48  0.90  0.00   0.76 0.28 0.40  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.26   4.70 1.86 0.36  #3a443e  n=sill
  box  0.00  0.00  0.62   4.76 1.92 0.62  #4a5a52  n=body
  box -0.20  0.00  1.24   2.90 1.84 0.54  #4a5a52  roof=0.70 n=cabin
  box -1.10  0.00  1.78   1.50 1.78 0.12  #4a5a52  n=roof.step
  box -1.10  0.80  1.90   1.50 0.10 0.06  #2b3036  mir=1 n=roof.rail
  box  2.42  0.68  1.00   0.14 0.40 0.24  #f4f5f1  mir=1 n=lamp
  box  2.44  0.00  0.72   0.08 1.24 0.30  #14171a  n=grille
  box -2.44  0.72  1.10   0.10 0.32 0.32  #c0392b  mir=1 n=tail

sprite miata
mass 980
state parked
  box  1.22  0.76  0.00   0.56 0.22 0.30  #0d0e10  mir=1 n=wheel.front
  box -1.22  0.76  0.00   0.56 0.22 0.30  #0d0e10  mir=1 n=wheel.rear
  box  0.00  0.00  0.14   3.84 1.60 0.28  #6e2a25  n=sill
  box -0.10  0.00  0.42   3.50 1.66 0.30  #9e3a33  n=body
  box -0.45  0.00  0.72   1.30 1.48 0.34  #23272c  top=#1b1f23 n=softtop
  box -1.30  0.00  0.72   1.00 1.56 0.08  #9e3a33  n=boot
  box  1.86  0.00  0.42   0.44 1.40 0.20  #9e3a33  n=nose
  box  1.44  0.48  0.72   0.24 0.32 0.22  #f4f5f1  mir=1 n=lamp.popup
  box  2.10  0.00  0.44   0.08 0.60 0.10  #14171a  n=grille
  box -1.92  0.56  0.56   0.08 0.28 0.16  #c0392b  mir=1 n=tail

sprite trolley
mass 25
state wire
  box  0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.front
  box -0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.rear
  box  0.02  0.00  0.30   0.84 0.46 0.26  #aab3b7  mesh=0.075 top=none n=basket.lower
  box  0.00  0.00  0.56   0.98 0.56 0.28  #aab3b7  mesh=0.075 top=none n=basket.upper
  box  0.49  0.00  0.84   0.04 0.58 0.03  #c2cacd  n=rim.front
  box -0.49  0.00  0.84   0.04 0.58 0.03  #c2cacd  n=rim.back
  box  0.00  0.27  0.84   1.00 0.04 0.03  #c2cacd  mir=1 n=rim.side
  box -0.52  0.00  0.87   0.07 0.60 0.10  #7a4043  n=handle
  box  0.10  0.24  0.10   0.70 0.05 0.22  #798287  mir=1 n=frame
state deep
  box  0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.front
  box -0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.rear
  box  0.00  0.00  0.24   0.96 0.54 0.64  #aab3b7  mesh=0.11 top=none n=basket
  box  0.48  0.00  0.88   0.04 0.57 0.03  #c2cacd  n=rim.front
  box -0.48  0.00  0.88   0.04 0.57 0.03  #c2cacd  n=rim.back
  box  0.00  0.27  0.88   0.99 0.04 0.03  #c2cacd  mir=1 n=rim.side
  box -0.52  0.00  0.91   0.07 0.60 0.10  #7a4043  n=handle
  box  0.00  0.25  0.10   0.62 0.05 0.16  #798287  mir=1 n=frame
state loaded
  box  0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.front
  box -0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.rear
  box  0.02  0.00  0.30   0.84 0.46 0.26  #aab3b7  mesh=0.075 top=none n=basket.lower
  box  0.00  0.00  0.56   0.98 0.56 0.28  #aab3b7  mesh=0.075 top=none n=basket.upper
  box  0.49  0.00  0.84   0.04 0.58 0.03  #c2cacd  n=rim.front
  box -0.49  0.00  0.84   0.04 0.58 0.03  #c2cacd  n=rim.back
  box  0.00  0.27  0.84   1.00 0.04 0.03  #c2cacd  mir=1 n=rim.side
  box -0.52  0.00  0.87   0.07 0.60 0.10  #7a4043  n=handle
  box  0.10  0.24  0.10   0.70 0.05 0.22  #798287  mir=1 n=frame
  box  0.16  0.06  0.33   0.20 0.30 0.40  #c9772b  n=cornflakes
  box -0.18 -0.04  0.33   0.34 0.24 0.16  #9aa4a8  n=milk
  box -0.10  0.14  0.49   0.26 0.20 0.12  #6f7f5e  n=greens
state child-seat
  box  0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.front
  box -0.40  0.22  0.00   0.10 0.08 0.10  #2a2d30  mir=1 n=wheel.rear
  box  0.04  0.00  0.28   0.90 0.52 0.52  #aab3b7  mesh=0.08 top=none n=basket
  box  0.50  0.00  0.80   0.04 0.55 0.03  #c2cacd  n=rim.front
  box -0.42  0.00  0.80   0.04 0.55 0.03  #c2cacd  n=rim.back
  box  0.04  0.26  0.80   0.93 0.04 0.03  #c2cacd  mir=1 n=rim.side
  box -0.26  0.00  0.74   0.20 0.42 0.06  #7a4043  n=seat.base
  box -0.38  0.00  0.80   0.08 0.46 0.22  #7a4043  n=seat.back
  box -0.50  0.00  1.00   0.07 0.60 0.08  #7a4043  n=handle
  box  0.14  0.24  0.10   0.66 0.05 0.18  #798287  mir=1 n=frame
`);
