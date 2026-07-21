// Core rig math. Everything is plain data (bones + animations) so projects
// can be saved/loaded as JSON.
//
// A bone represents one cut-out body part (torso, upper arm, hand, ...).
// - pivot: {x,y} in the bone's OWN image pixel space — the point it rotates around
//   (e.g. the shoulder point on the upper-arm image).
// - localOffset: {x,y} — where this bone's pivot sits relative to its parent's
//   pivot, measured in the parent's UNROTATED (bind-pose) frame. Computed once
//   at bind time, then rotation is layered on top at pose time.
// - rotation: current rotation in degrees, relative to bind pose, around `pivot`.

export function deg2rad(d) {
  return (d * Math.PI) / 180
}

export function rotatePoint(x, y, deg) {
  const r = deg2rad(deg)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

// Compute world transform (position + cumulative rotation) for every bone.
export function computeWorldTransforms(bones, rotations) {
  const byId = Object.fromEntries(bones.map((b) => [b.id, b]))
  const world = {}

  function resolve(id) {
    if (world[id]) return world[id]
    const bone = byId[id]
    const ownRot = rotations[id] ?? 0

    if (!bone.parentId) {
      world[id] = { x: bone.rootX ?? 0, y: bone.rootY ?? 0, rot: ownRot }
      return world[id]
    }

    const parent = resolve(bone.parentId)
    const offset = rotatePoint(bone.localOffset.x, bone.localOffset.y, parent.rot)
    world[id] = {
      x: parent.x + offset.x,
      y: parent.y + offset.y,
      rot: parent.rot + ownRot,
    }
    return world[id]
  }

  bones.forEach((b) => resolve(b.id))
  return world
}

// Linear interpolation between two keyframes' rotation maps.
export function interpolateRotations(kfA, kfB, t) {
  const ids = new Set([...Object.keys(kfA.rotations), ...Object.keys(kfB.rotations)])
  const out = {}
  ids.forEach((id) => {
    const a = kfA.rotations[id] ?? 0
    const b = kfB.rotations[id] ?? 0
    out[id] = a + (b - a) * t
  })
  return out
}

// Given a sorted keyframe list and a time, return the interpolated rotation map.
export function sampleAnimation(keyframes, time) {
  if (keyframes.length === 0) return {}
  if (keyframes.length === 1) return keyframes[0].rotations
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (time <= sorted[0].time) return sorted[0].rotations
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].rotations

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time || 1)
      return interpolateRotations(a, b, t)
    }
  }
  return sorted[sorted.length - 1].rotations
}
