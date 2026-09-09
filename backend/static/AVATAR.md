# Doctor avatar — drop-in contract

The AI doctor's face is **not** shipped with this repo. Drop your own asset in
here and run one script; everything downstream picks it up.

Until you do, the app renders a built-in vector doctor whose mouth is driven by
the real audio waveform. Nothing is broken without an asset — you just don't get
photoreal lip-sync.

> The file that used to live here (`doctor_avatar.png`) was official Hatsune Miku
> character art. It was removed: it is licensed character IP, inappropriate for a
> medical product, and unusable by MuseTalk, whose UNet inpaints a *photographic*
> mouth region trained on real human video. An illustrated face produces a smeared
> human-mouth texture patch, if face detection succeeds at all.

## What to provide

Put **one** of these in this directory:

| File | Use |
|---|---|
| `doctor_avatar.png` | Minimum. A still portrait. |
| `doctor_idle_source.mp4` | **Better.** 5–10 s of the person sitting still, looking at camera. |

Prefer the clip. MuseTalk cycles through prepared frames and only repaints the
mouth — driven by a single still you get a frozen head with a moving jaw, which
is the classic uncanny failure. A few seconds of natural micro-movement
(breathing, small head drift, a blink) fixes it entirely.

### Requirements

- **512×512** or larger, even dimensions (libx264 rejects odd ones).
- **Frontal**, looking at the camera. Head rotation under ~15°.
- **Neutral expression, mouth closed.** An open mouth in the reference biases
  every generated frame.
- **Even, diffuse lighting.** Hard shadows across the jaw produce a visible seam
  where the repainted mouth region is composited back.
- **Nothing occluding the jaw or mouth** — no hand on chin, no mask, no heavy
  beard shadow. Glasses are fine.
- Face fills roughly **45–55%** of the frame height.

### Licence — required

Add a sibling `AVATAR_SOURCE.txt` recording where the asset came from and under
what licence or release. This is a medical-facing product presenting a synthetic
clinician; the provenance of the likeness has to be traceable.

Acceptable sources include a photo of yourself, a model release you hold, a
CC0/Unsplash-licence portrait, or a synthetic face you generated. If you use a
real person's likeness, you need their consent for this use specifically.

`AVATAR_SOURCE.txt` and any asset you drop here are gitignored by default —
they're yours, not the repo's.

## After dropping it in

```bash
python backend/generate_idle_video.py
```

This writes:

- `public/doctor_idle.mp4` — the looping idle clip, **H.264** so browsers can
  actually decode it
- `public/doctor_portrait.png` — the still the browser-side fallback warps

**This is the other reason to supply `doctor_idle_source.mp4` rather than just
a still.** When the clip is present the idle loop is built from that same
footage — ping-ponged (forward then reverse) so the loop point is invisible,
at the source's own resolution and 25fps. That matters because MuseTalk
renders its *talking* clips from the very same frames: idle and speaking then
share framing, resolution and frame rate, and the cut between them is barely
visible.

With only a still, the idle loop can only be a synthetic ±0.8% "breathing"
zoom on a photograph. It plays, but it reads as a static portrait on screen —
and if the still's aspect ratio differs from the source clip's, the tile also
visibly jumps every time the doctor starts and stops talking.

Confirm the codec:

```bash
ffmpeg -hide_banner -i public/doctor_idle.mp4     # must say h264 (avc1)
```

If it says `mpeg4 (Simple Profile) / mp4v`, the file will not play in Chrome or
Firefox and the UI will silently fall back to the canvas avatar.

For GPU lip-sync, point the MuseTalk sidecar at the same asset — see
`MUSETALK_SETUP.md`.
