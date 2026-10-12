/* Tesco Trueno sprites: living things.
   People and animals: the cast, the gulls, the fox - and the umbrella they
   carry, which flies off on its own in a squall.
   Open THIS file in sprite-editor.html and save it back here. Everything
   between the backticks is plain sprite text; the line around it is only
   there so the game can load it from disk without a web server. */
(window.SPRITE_SOURCES = window.SPRITE_SOURCES || []).push(String.raw`
# tesco-trueno sprite format v2
#
# axes   f = along facing (+ forward), l = lateral (+ left), z = up. metres.
# box    box <f> <l> <z>  <L> <W> <H>  <colour>  [flags]
#          f,l are the box centre; z is its BASE. L is along f, W along l, H up.
# colour #rrggbb | #rrggbbaa | none | paint | paint:<k>
#          paint: the owner's colour (an umbrella's canopy, say)
#          paint:0.75 is that colour darkened to 75%
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

sprite granny
mass 65
state hunched
  box  0.02  0.11  0.00   0.22 0.13 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.38 0.48 0.70  #6f5f5c  n=skirt
  box -0.02  0.00  0.76   0.34 0.42 0.50  #8d6b70  n=coat
  box -0.04  0.00  1.26   0.32 0.38 0.12  #8d6b70  n=shoulders
  box  0.04  0.00  1.38   0.22 0.22 0.20  #c2a08a  n=head
  box  0.03  0.00  1.52   0.25 0.25 0.14  #5c7a74  n=headscarf
  box -0.08  0.30  0.70   0.17 0.13 0.20  #46352f  n=handbag
state rigid
  box  0.02  0.10  0.00   0.22 0.12 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.30 0.38 0.78  #6f5f5c  n=skirt
  box  0.00  0.00  0.84   0.28 0.34 0.60  #7d8489  n=coat
  box  0.00  0.00  1.44   0.28 0.40 0.10  #7d8489  n=shoulders
  box  0.00  0.00  1.54   0.21 0.21 0.20  #c2a08a  n=head
  box  0.00  0.00  1.70   0.24 0.24 0.10  #cbcec9  n=hair
  box -0.06  0.26  0.86   0.15 0.12 0.18  #46352f  n=handbag
state round
  box  0.00  0.13  0.00   0.24 0.14 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.44 0.60 1.10  #6f5f5c  n=coat
  box -0.02  0.00  1.16   0.40 0.52 0.14  #8d6b70  n=shoulders
  box  0.02  0.00  1.30   0.20 0.20 0.16  #c2a08a  n=head
  box  0.02  0.00  1.42   0.23 0.23 0.12  #8d6b70  n=headscarf
  box -0.06  0.36  0.68   0.16 0.12 0.18  #46352f  n=handbag

sprite shopper
mass 82
state leaning
  box  0.10  0.11  0.00   0.26 0.13 0.06  #26282b  mir=1 n=shoe
  box  0.04  0.00  0.06   0.30 0.40 0.80  #5b6169  n=legs
  box  0.08  0.00  0.86   0.32 0.46 0.54  #4a5a52  n=gilet
  box  0.12  0.00  1.40   0.30 0.50 0.12  #4a5a52  n=shoulders
  box  0.20  0.00  1.52   0.22 0.22 0.20  #c2a08a  n=head
  box  0.20  0.00  1.68   0.24 0.24 0.08  #8e9398  n=hair
  box  0.16  0.30  0.98   0.34 0.13 0.36  #b9bcbe  mir=1 rot=0.25 n=arm
state broad
  box  0.02  0.13  0.00   0.26 0.14 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.28 0.36 0.76  #5b6169  n=legs
  box  0.00  0.00  0.82   0.34 0.52 0.60  #8e9398  n=torso
  box  0.00  0.00  1.42   0.34 0.60 0.12  #8e9398  n=shoulders
  box  0.02  0.00  1.54   0.23 0.23 0.20  #c2a08a  n=head
  box  0.02  0.00  1.70   0.25 0.25 0.08  #7d8489  n=hair
  box  0.00  0.34  1.00   0.30 0.14 0.40  #c2a08a  mir=1 n=arm
state mid-stride
  box  0.28  0.12  0.00   0.28 0.14 0.07  #26282b  n=shoe.lead
  box -0.24 -0.12  0.00   0.28 0.14 0.07  #26282b  n=shoe.trail
  box  0.16  0.12  0.07   0.22 0.17 0.77  #5b6169  rot=0.18 n=leg.lead
  box -0.14 -0.12  0.07   0.22 0.17 0.77  #5b6169  rot=-0.18 n=leg.trail
  box  0.04  0.00  0.84   0.32 0.44 0.54  #6f5f5c  n=torso
  box  0.06  0.00  1.38   0.32 0.50 0.12  #6f5f5c  n=shoulders
  box  0.12  0.00  1.50   0.22 0.22 0.20  #c2a08a  n=head
  box  0.12  0.00  1.66   0.24 0.24 0.08  #3a3735  n=hair
  box  0.26  0.31  1.04   0.30 0.13 0.26  #c2a08a  rot=0.40 n=arm.fwd
  box -0.20 -0.31  1.04   0.30 0.13 0.26  #c2a08a  rot=-0.40 n=arm.back

sprite trolleyboy
mass 70
state slouch
  box  0.02  0.11  0.00   0.26 0.13 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.28 0.38 0.78  #3c4148  n=legs
  box  0.00  0.00  0.84   0.32 0.46 0.50  #cfe03c  n=hivis
  box -0.04  0.00  1.34   0.30 0.42 0.08  #cfe03c  n=shoulders
  box  0.04  0.00  1.42   0.21 0.21 0.20  #c2a08a  n=head
  box  0.04  0.00  1.58   0.24 0.24 0.10  #2f3a44  n=cap
  box  0.18  0.00  1.58   0.12 0.22 0.05  #2f3a44  n=peak
  box  0.02  0.28  0.96   0.16 0.12 0.30  #a89a86  mir=1 n=arm
state smoking
  box  0.02  0.11  0.00   0.26 0.13 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.28 0.38 0.82  #3c4148  n=legs
  box  0.00  0.00  0.88   0.32 0.46 0.54  #cfe03c  n=hivis
  box  0.00  0.00  1.42   0.30 0.50 0.10  #cfe03c  n=shoulders
  box  0.01  0.00  1.52   0.21 0.21 0.20  #c2a08a  n=head
  box  0.01  0.00  1.68   0.24 0.24 0.10  #2f3a44  n=cap
  box  0.15  0.00  1.68   0.12 0.22 0.05  #2f3a44  n=peak
  box  0.16  0.05  1.58   0.10 0.04 0.03  #e8e4dc  n=cigarette
  box  0.23  0.05  1.58   0.05 0.05 0.03  #e8523f  n=ember
  box  0.00  0.29  1.02   0.14 0.12 0.32  #a89a86  mir=1 n=arm
state lanky
  box  0.02  0.12  0.00   0.26 0.13 0.06  #26282b  mir=1 n=shoe
  box  0.00  0.00  0.06   0.24 0.34 0.94  #3c4148  n=legs
  box  0.00  0.00  1.00   0.34 0.48 0.48  #cfe03c  n=hivis
  box  0.00  0.00  1.48   0.28 0.40 0.08  #4a5158  n=shoulders
  box  0.02  0.00  1.56   0.20 0.20 0.20  #c2a08a  n=head
  box  0.02  0.00  1.72   0.23 0.23 0.08  #3a3735  n=hair
  box  0.00  0.30  1.10   0.13 0.11 0.36  #a89a86  mir=1 n=arm

sprite manager
mass 85
state suit
  box  0.02  0.12  0.00   0.28 0.14 0.06  #1b1d20  mir=1 n=shoe
  box  0.00  0.00  0.06   0.30 0.42 0.82  #23272c  n=legs
  box  0.00  0.00  0.88   0.34 0.52 0.56  #23272c  n=jacket
  box  0.18  0.00  1.10   0.06 0.20 0.34  #dfe3e6  n=shirt
  box  0.21  0.00  1.12   0.05 0.08 0.26  #7a4043  n=tie
  box  0.00  0.00  1.44   0.34 0.58 0.12  #23272c  n=shoulders
  box  0.10  0.00  1.56   0.16 0.26 0.04  #dfe3e6  n=collar
  box  0.02  0.00  1.60   0.22 0.22 0.20  #c2a08a  n=head
  box  0.02  0.00  1.76   0.24 0.24 0.07  #2e2b28  n=hair
  box  0.00  0.32  1.02   0.16 0.13 0.38  #23272c  mir=1 n=arm
state clipboard
  box  0.02  0.12  0.00   0.28 0.14 0.06  #1b1d20  mir=1 n=shoe
  box  0.00  0.00  0.06   0.30 0.42 0.82  #22262b  n=legs
  box  0.00  0.00  0.88   0.34 0.50 0.56  #35618c  n=shirt
  box  0.18  0.00  1.16   0.05 0.06 0.24  #d8d2c4  n=lanyard
  box  0.00  0.00  1.44   0.32 0.54 0.10  #35618c  n=shoulders
  box  0.02  0.00  1.54   0.22 0.22 0.20  #c2a08a  n=head
  box  0.02  0.00  1.70   0.24 0.24 0.08  #2e2b28  n=hair
  box  0.32  0.00  1.00   0.06 0.34 0.30  #c7c8c3  n=clipboard
  box  0.14  0.30  1.06   0.28 0.13 0.24  #35618c  mir=1 rot=0.50 n=arm
state looming
  box  0.00  0.12  0.00   0.28 0.14 0.06  #1b1d20  mir=1 n=shoe
  box  0.00  0.00  0.06   0.28 0.38 0.86  #23272c  n=legs
  box  0.00  0.00  0.92   0.32 0.46 0.58  #2b3036  n=jacket
  box  0.00  0.00  1.50   0.32 0.62 0.12  #2b3036  n=shoulders
  box  0.00  0.00  1.62   0.14 0.14 0.06  #c2a08a  n=neck
  box  0.00  0.00  1.68   0.22 0.22 0.20  #c2a08a  n=head
  box  0.00  0.00  1.84   0.24 0.24 0.07  #2e2b28  n=hair
  box  0.00  0.34  1.08   0.15 0.13 0.38  #2b3036  mir=1 n=arm

sprite gull
mass 1.1
state loaf
  box  0.02  0.08  0.00   0.06 0.06 0.11  #d08a4a  mir=1 n=leg
  box  0.00  0.00  0.11   0.46 0.28 0.23  #dfe2df  n=body
  box -0.03  0.00  0.34   0.34 0.30 0.08  #9aa3a8  n=back
  box -0.30  0.00  0.24   0.16 0.20 0.08  #dfe2df  n=tail
  box  0.20  0.00  0.42   0.20 0.20 0.16  #eceeec  n=head
  box  0.34  0.00  0.48   0.14 0.07 0.06  #e2a84a  n=beak
state alert
  box  0.00  0.09  0.00   0.07 0.07 0.20  #d08a4a  mir=1 n=leg
  box  0.00  0.00  0.20   0.42 0.26 0.24  #dfe2df  n=body
  box -0.02  0.15  0.26   0.36 0.07 0.16  #9aa3a8  mir=1 n=wing
  box -0.30  0.00  0.30   0.18 0.18 0.10  #1b1e20  n=tail
  box  0.14  0.00  0.44   0.14 0.15 0.16  #eceeec  n=neck
  box  0.17  0.00  0.60   0.19 0.19 0.16  #eceeec  n=head
  box  0.31  0.00  0.66   0.15 0.07 0.06  #e2a84a  n=beak
state wings-out
; the wings were detached: body reaches l=0.14, the wing sat at l=0.42 with only
; 0.16 of width, leaving 0.20 m of air between them and another 0.11 before the
; tip. It was also built along the wrong axis - W is the lateral one, so a wing
; needs a big W and a modest L, not a fore-aft plank stuck out sideways.
  box  0.00  0.08  0.00   0.06 0.06 0.10  #d08a4a  mir=1 n=leg
  box  0.00  0.00  0.10   0.44 0.28 0.22  #dfe2df  n=body
  box -0.03  0.00  0.32   0.32 0.30 0.08  #9aa3a8  n=back
  box  0.00  0.35  0.28   0.30 0.44 0.07  #9aa3a8  mir=1 rot=0.16 n=wing
  box -0.06  0.63  0.27   0.22 0.18 0.06  #1b1e20  mir=1 rot=0.34 n=wingtip
  box -0.24  0.00  0.24   0.18 0.20 0.07  #dfe2df  n=tail
  box  0.20  0.00  0.40   0.20 0.20 0.16  #eceeec  n=head
  box  0.34  0.00  0.46   0.14 0.07 0.06  #e2a84a  n=beak
state overfed
  box -0.02  0.10  0.00   0.07 0.07 0.07  #d08a4a  mir=1 n=leg
  box  0.00  0.00  0.07   0.52 0.38 0.27  #dfe2df  n=body
  box -0.02  0.00  0.34   0.40 0.40 0.08  #9aa3a8  n=back
  box -0.32  0.00  0.22   0.16 0.22 0.10  #dfe2df  n=tail   ; was detached by 1 cm
  box  0.24  0.00  0.42   0.16 0.16 0.12  #eceeec  n=head
  box  0.34  0.00  0.46   0.12 0.06 0.05  #e2a84a  n=beak

sprite fox
mass 6.5
state trot
  box  0.16  0.10  0.00   0.07 0.07 0.16  #2a2124  mir=1 n=foreleg
  box -0.20  0.10  0.00   0.07 0.07 0.17  #2a2124  mir=1 n=hindleg
  box  0.00  0.00  0.16   0.62 0.22 0.20  #b5561f  n=body
  box  0.02  0.00  0.15   0.50 0.20 0.06  #e8e2d8  n=belly
  box  0.34  0.00  0.24   0.16 0.16 0.14  #c4632a  n=head
  box  0.44  0.00  0.19   0.10 0.11 0.05  #e8e2d8  n=bib
  box  0.46  0.00  0.22   0.14 0.09 0.08  #8e4018  n=snout
  box  0.52  0.00  0.23   0.05 0.05 0.04  #1b1516  n=nose
  box  0.30  0.07  0.36   0.06 0.07 0.10  #8e4018  mir=1 n=ear
  box -0.36  0.00  0.22   0.30 0.16 0.15  #b5561f  rot=-0.15 n=tail
  box -0.52  0.00  0.24   0.14 0.13 0.12  #efeae2  n=tailtip
state sniff
  box  0.16  0.10  0.00   0.07 0.07 0.16  #2a2124  mir=1 n=foreleg
  box -0.20  0.10  0.00   0.07 0.07 0.17  #2a2124  mir=1 n=hindleg
  box -0.02  0.00  0.15   0.62 0.22 0.20  #b5561f  rot=0 n=body
  box  0.00  0.00  0.14   0.50 0.20 0.06  #e8e2d8  n=belly
  box  0.32  0.00  0.13   0.16 0.16 0.14  #c4632a  n=head
  box  0.44  0.00  0.07   0.14 0.09 0.08  #8e4018  n=snout
  box  0.50  0.00  0.06   0.05 0.05 0.04  #1b1516  n=nose
  box  0.28  0.07  0.24   0.06 0.07 0.10  #8e4018  mir=1 n=ear
  box -0.38  0.00  0.24   0.30 0.16 0.15  #b5561f  rot=-0.30 n=tail
  box -0.54  0.00  0.30   0.14 0.13 0.12  #efeae2  n=tailtip
state alert
  box  0.16  0.10  0.00   0.07 0.07 0.20  #2a2124  mir=1 n=foreleg
  box -0.20  0.10  0.00   0.07 0.07 0.21  #2a2124  mir=1 n=hindleg
  box  0.00  0.00  0.20   0.60 0.22 0.20  #b5561f  n=body
  box  0.02  0.00  0.19   0.48 0.20 0.06  #e8e2d8  n=belly
  box  0.30  0.00  0.34   0.14 0.15 0.16  #c4632a  n=neck
  box  0.32  0.00  0.48   0.17 0.17 0.14  #c4632a  n=head
  box  0.42  0.00  0.30   0.10 0.11 0.05  #e8e2d8  n=bib
  box  0.44  0.00  0.46   0.14 0.09 0.08  #8e4018  n=snout
  box  0.50  0.00  0.47   0.05 0.05 0.04  #1b1516  n=nose
  box  0.28  0.07  0.60   0.07 0.08 0.13  #8e4018  mir=1 n=ear
  box -0.34  0.00  0.28   0.28 0.16 0.15  #b5561f  rot=0.34 n=tail
  box -0.48  0.00  0.40   0.14 0.13 0.12  #efeae2  n=tailtip
sprite umbrella
size 1.05 1.05 1.15
state held
  box  0.12  0.22  0     0.05 0.05 1.00  #2a2d30  n=pole
  box  0     0     1.00  1.05 1.05 0.08  paint     n=canopy
  box  0     0     1.08  0.60 0.60 0.07  paint     n=crown
state blown
  box  0     0     0     1.00 1.00 0.08  paint     n=canopy
  box  0     0     0.08  0.55 0.55 0.07  paint     n=crown
`);
