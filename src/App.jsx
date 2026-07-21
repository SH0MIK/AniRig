import React, { useRef, useState, useEffect, useCallback } from 'react'
import { computeWorldTransforms, sampleAnimation } from './skeleton.js'

const CANVAS_W = 900
const CANVAS_H = 600
const PIVOT_HANDLE_R = 9
const PIVOT_HIT_R = 20 // generous hit target for touch

let uid = 0
const nextId = () => `b${++uid}`

export default function App() {
  const [bones, setBones] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('bind') // 'bind' | 'pose' | 'play'
  const [rotations, setRotations] = useState({}) // boneId -> deg, pose-mode values
  const [keyframes, setKeyframes] = useState([]) // {id, time, rotations}
  const [playTime, setPlayTime] = useState(0)
  const [duration, setDuration] = useState(2)
  const [isPlaying, setIsPlaying] = useState(false)

  const canvasRef = useRef(null)
  const imagesRef = useRef({}) // boneId -> HTMLImageElement
  const dragRef = useRef(null) // {type:'move'|'pivot', boneId, lastX, lastY}
  const rafRef = useRef(null)

  // ---------- image loading ----------
  const loadImageForBone = (boneId, src) =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        imagesRef.current[boneId] = img
        resolve(img)
      }
      img.src = src
    })

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const src = reader.result
      const id = nextId()
      const img = await loadImageForBone(id, src)
      const isRoot = bones.length === 0
      const newBone = {
        id,
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 20) || `bone_${id}`,
        parentId: isRoot ? null : bones[bones.length - 1].id,
        image: src,
        imgW: img.width,
        imgH: img.height,
        pivot: { x: img.width / 2, y: img.height / 2 },
        rootX: CANVAS_W / 2,
        rootY: CANVAS_H / 2,
        localOffset: { x: 0, y: -Math.min(img.height / 2, 80) },
      }
      setBones((prev) => [...prev, newBone])
      setSelectedId(id)
      setRotations((prev) => ({ ...prev, [id]: 0 }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const updateBone = (id, patch) => {
    setBones((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  const removeBone = (id) => {
    setBones((prev) =>
      prev
        .filter((b) => b.id !== id)
        .map((b) => (b.parentId === id ? { ...b, parentId: null, rootX: CANVAS_W / 2, rootY: CANVAS_H / 2 } : b)),
    )
    if (selectedId === id) setSelectedId(null)
  }

  const reorder = (id, dir) => {
    setBones((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]]
      return copy
    })
  }

  // ---------- current rotation set (pose vs. playback) ----------
  const activeRotations = mode === 'play' ? sampleAnimation(keyframes, playTime) : rotations

  // ---------- keyframes ----------
  const addKeyframe = () => {
    const t = Math.round(playTime * 100) / 100
    setKeyframes((prev) => {
      const withoutSameTime = prev.filter((k) => Math.abs(k.time - t) > 0.001)
      return [...withoutSameTime, { id: `k${Date.now()}`, time: t, rotations: { ...rotations } }].sort(
        (a, b) => a.time - b.time,
      )
    })
  }
  const removeKeyframe = (id) => setKeyframes((prev) => prev.filter((k) => k.id !== id))

  // ---------- playback ----------
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    let start = null
    const step = (ts) => {
      if (start === null) start = ts
      const elapsed = ((ts - start) / 1000) % (duration || 1)
      setPlayTime(elapsed)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, duration])

  // ---------- rendering ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = '#1b1f2a'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    const rotsForRender = mode === 'bind' ? {} : activeRotations
    const world = computeWorldTransforms(bones, rotsForRender)

    bones.forEach((bone) => {
      const img = imagesRef.current[bone.id]
      if (!img) return
      const t = world[bone.id]
      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.rotate((t.rot * Math.PI) / 180)
      ctx.globalAlpha = mode === 'bind' && selectedId && selectedId !== bone.id ? 0.45 : 1
      ctx.drawImage(img, -bone.pivot.x, -bone.pivot.y, bone.imgW, bone.imgH)
      ctx.restore()
    })

    if (mode === 'bind' && selectedId) {
      const t = world[selectedId]
      if (t) {
        ctx.beginPath()
        ctx.arc(t.x, t.y, PIVOT_HANDLE_R, 0, Math.PI * 2)
        ctx.fillStyle = '#ff5a5f'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      }
    }
  }, [bones, activeRotations, mode, selectedId])

  useEffect(() => {
    draw()
  }, [draw])

  // ---------- bind-mode dragging ----------
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return {
      x: ((point.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((point.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  const onPointerDown = (e) => {
    if (mode !== 'bind') return
    e.preventDefault()
    const pos = getMousePos(e)
    const world = computeWorldTransforms(bones, {})

    // check pivot handle of selected bone first
    if (selectedId) {
      const t = world[selectedId]
      if (t && Math.hypot(pos.x - t.x, pos.y - t.y) <= PIVOT_HIT_R) {
        dragRef.current = { type: 'pivot', boneId: selectedId, lastX: pos.x, lastY: pos.y }
        return
      }
    }

    // otherwise hit-test bones topmost-first (rest pose, axis-aligned)
    for (let i = bones.length - 1; i >= 0; i--) {
      const bone = bones[i]
      const t = world[bone.id]
      const left = t.x - bone.pivot.x
      const top = t.y - bone.pivot.y
      if (pos.x >= left && pos.x <= left + bone.imgW && pos.y >= top && pos.y <= top + bone.imgH) {
        setSelectedId(bone.id)
        dragRef.current = { type: 'move', boneId: bone.id, lastX: pos.x, lastY: pos.y }
        return
      }
    }
  }

  const onPointerMove = (e) => {
    if (!dragRef.current) return
    e.preventDefault()
    const pos = getMousePos(e)
    const dx = pos.x - dragRef.current.lastX
    const dy = pos.y - dragRef.current.lastY
    dragRef.current.lastX = pos.x
    dragRef.current.lastY = pos.y
    const bone = bones.find((b) => b.id === dragRef.current.boneId)
    if (!bone) return

    if (dragRef.current.type === 'move') {
      if (!bone.parentId) {
        updateBone(bone.id, { rootX: bone.rootX + dx, rootY: bone.rootY + dy })
      } else {
        updateBone(bone.id, { localOffset: { x: bone.localOffset.x + dx, y: bone.localOffset.y + dy } })
      }
    } else if (dragRef.current.type === 'pivot') {
      const newPivot = { x: bone.pivot.x + dx, y: bone.pivot.y + dy }
      if (!bone.parentId) {
        updateBone(bone.id, { pivot: newPivot, rootX: bone.rootX + dx, rootY: bone.rootY + dy })
      } else {
        updateBone(bone.id, {
          pivot: newPivot,
          localOffset: { x: bone.localOffset.x + dx, y: bone.localOffset.y + dy },
        })
      }
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  // ---------- save / load ----------
  const saveProject = () => {
    const data = JSON.stringify({ bones, keyframes, duration }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'anirig-project.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadProject = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const data = JSON.parse(reader.result)
      for (const b of data.bones) {
        await loadImageForBone(b.id, b.image)
      }
      setBones(data.bones)
      setKeyframes(data.keyframes || [])
      setDuration(data.duration || 2)
      const initRot = {}
      data.bones.forEach((b) => (initRot[b.id] = 0))
      setRotations(initRot)
      setSelectedId(data.bones[0]?.id ?? null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const selectedBone = bones.find((b) => b.id === selectedId)
  const modeSteps = [
    { key: 'bind', label: 'Attach' },
    { key: 'pose', label: 'Pose' },
    { key: 'play', label: 'Play' },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>AniRig</span>
        </div>

        <div className="stepper">
          {modeSteps.map((m, i) => (
            <React.Fragment key={m.key}>
              {i > 0 && <span className={`link ${modeSteps.findIndex((s) => s.key === mode) >= i ? 'done' : ''}`} />}
              <button
                className={`node ${mode === m.key ? 'active' : ''}`}
                onClick={() => { setMode(m.key); setIsPlaying(false) }}
              >
                <span className="dot">{i + 1}</span>
                {m.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="io">
          <label className="filebtn">
            Load
            <input type="file" accept="application/json" onChange={loadProject} hidden />
          </label>
          <button onClick={saveProject}>Save</button>
        </div>
      </header>

      <div className="body">
        <main className="stage">
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{ touchAction: mode === 'bind' ? 'none' : 'auto' }}
            />
            {bones.length === 0 && (
              <div className="empty">
                <p>Upload a body part to start rigging.</p>
                <label className="filebtn primary">
                  + Upload image
                  <input type="file" accept="image/*" onChange={handleUpload} hidden />
                </label>
              </div>
            )}
          </div>
        </main>

        <aside className="panel">
          {bones.length > 0 && (
            <label className="filebtn primary block">
              + Add body part
              <input type="file" accept="image/*" onChange={handleUpload} hidden />
            </label>
          )}

          <ul className="bonelist">
            {bones.map((b) => (
              <li key={b.id} className={b.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(b.id)}>
                <span className="name">{b.name}</span>
                <span className="controls">
                  <button title="Forward" onClick={(e) => { e.stopPropagation(); reorder(b.id, 1) }}>↑</button>
                  <button title="Backward" onClick={(e) => { e.stopPropagation(); reorder(b.id, -1) }}>↓</button>
                  <button title="Delete" onClick={(e) => { e.stopPropagation(); removeBone(b.id) }}>✕</button>
                </span>
              </li>
            ))}
          </ul>

          {selectedBone && mode === 'bind' && (
            <div className="inspector">
              <label>
                Name
                <input value={selectedBone.name} onChange={(e) => updateBone(selectedBone.id, { name: e.target.value })} />
              </label>
              <label>
                Attached to
                <select
                  value={selectedBone.parentId || ''}
                  onChange={(e) => {
                    const parentId = e.target.value || null
                    updateBone(selectedBone.id, {
                      parentId,
                      localOffset: { x: 0, y: -60 },
                      rootX: CANVAS_W / 2,
                      rootY: CANVAS_H / 2,
                    })
                  }}
                >
                  <option value="">Nothing (root part)</option>
                  {bones.filter((b) => b.id !== selectedBone.id).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
              <p className="hint">Drag the part to position it · drag the dot to set its joint</p>
            </div>
          )}

          {selectedBone && mode === 'pose' && (
            <div className="inspector">
              <label>
                {selectedBone.name} rotation
                <span className="value">{Math.round(rotations[selectedBone.id] || 0)}°</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={rotations[selectedBone.id] || 0}
                  onChange={(e) => setRotations((prev) => ({ ...prev, [selectedBone.id]: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}
        </aside>
      </div>

      {mode === 'pose' && (
        <footer className="timeline">
          <button className="cta" onClick={addKeyframe}>+ Keyframe @ {playTime.toFixed(2)}s</button>
          <input
            type="range"
            className="scrub"
            min={0}
            max={duration}
            step={0.01}
            value={playTime}
            onChange={(e) => {
              const t = Number(e.target.value)
              setPlayTime(t)
              setRotations(sampleAnimation(keyframes, t))
            }}
          />
          <label className="dur">
            <input type="number" min={0.5} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />s
          </label>
          <div className="keyframes">
            {keyframes.map((k) => (
              <span key={k.id} className="kf">
                {k.time.toFixed(2)}s
                <button onClick={() => removeKeyframe(k.id)}>✕</button>
              </span>
            ))}
          </div>
        </footer>
      )}

      {mode === 'play' && (
        <footer className="timeline">
          <button className="cta" onClick={() => setIsPlaying((p) => !p)}>{isPlaying ? 'Pause' : 'Play'}</button>
          <input
            type="range"
            className="scrub"
            min={0}
            max={duration}
            step={0.01}
            value={playTime}
            onChange={(e) => setPlayTime(Number(e.target.value))}
          />
          <span className="readout">{playTime.toFixed(2)}s / {duration}s</span>
        </footer>
      )}
    </div>
  )
}
