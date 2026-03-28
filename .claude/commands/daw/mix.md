Analyze the current mix and suggest improvements.

1. Read mixer state with daw_get_mixer and project state with daw_get_project
2. Analyze:
   - Volume balance across tracks
   - Panning spread (are things centered or spread out?)
   - Mute/solo state
   - Track types and their typical level ranges
3. Suggest improvements based on genre conventions:
   - Kick and bass typically louder, centered
   - Pads and atmospheres quieter, wider stereo
   - Lead elements forward in the mix
4. Apply approved changes via daw_set_volume, daw_set_pan, daw_toggle_mute

Display the current and proposed mix as a table for easy comparison.
