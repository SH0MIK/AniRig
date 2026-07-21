# AniRig — 2D Character Rigging & Animation Tool (MVP)

## Run it
```
npm install
npm run dev
```
Then open the local URL it prints (usually http://localhost:5173).

## How to use
1. **Bind mode** — Upload each body part as a separate image (torso first, then
   limbs). Drag a part onto the canvas to attach it to its parent. Select a
   parent from the dropdown in the side panel. Drag the red dot to set the
   joint (pivot) point.
2. **Pose & Keyframe mode** — Select a bone, use the rotation slider to pose
   it, then click "Add keyframe" at the current time. Move the time scrubber
   and repeat to build a walk cycle, wave, etc.
3. **Play mode** — Hit Play to see your animation loop with interpolated
   motion between keyframes.
4. **Save / Load project** — Saves everything (images + rig + keyframes) as
   one JSON file so you can come back to it later.

## Notes on the current MVP
- Parts are rigid (no mesh bending at joints yet) — expect visible seams at
  elbows/knees for now. Mesh deformation is a natural v2.
- You need to pre-cut each body part into its own image file (e.g. in any
  image editor) before uploading — auto-segmentation isn't built yet.
- Z-order (front/back) is controlled with the ↑ / ↓ buttons in the bone list.

## Where the code lives
- `src/skeleton.js` — the actual rig math: hierarchy, world transforms,
  keyframe interpolation. Framework-agnostic, no React/canvas in here.
- `src/App.jsx` — canvas rendering + all the UI/interaction logic.
